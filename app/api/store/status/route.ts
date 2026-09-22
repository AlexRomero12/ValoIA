import { NextRequest } from 'next/server';
import { getStoreFront, refreshStoreFront, rsoHealth } from '@/lib/riotClient';
import { getFavorites, type FavoriteSkin } from '@/lib/favorites';
import { getSkinsCatalog } from '@/lib/skins';
import { getBundleArt, resolveStoreItem, ITEM_TYPES, type BundleArt, type StoreItem } from '@/lib/items';
import { pushEnabled, pushConfig, getSubscriptions } from '@/lib/push';
import { notifiedToday } from '@/lib/storeWatch';
import { listProfilesFor } from '@/lib/profiles';
import { viewerFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Ítem de tienda ya resuelto (skin con niveles/variantes, o accesorio).
 * `kind` decide qué preview abre el cliente.
 */
export interface StoreItemUI {
  kind: 'skin' | 'card' | 'buddy' | 'spray' | 'title' | 'unknown';
  id: string;
  name: string;
  icon: string;
  // skins
  weapon?: string;
  rarity?: string | null;
  rarityColor?: string | null;
  collection?: string | null;
  levelCount?: number;
  variantCount?: number;
  // player card
  largeArt?: string;
  // spray
  fullIcon?: string;
  animationGif?: string | null;
  animationPng?: string | null;
  // buddy
  levels?: Array<{ id: string; name: string; icon: string; level: number }>;
  // title
  titleText?: string;
}

export interface StoreDailyItemUI extends StoreItemUI {
  offerId: string;
  price: number;
  isFavorite: boolean;
}

export interface StoreBundleItemUI extends StoreItemUI {
  itemId: string;
  price?: number;
  basePrice?: number;
}

export interface StoreBundleUI {
  id: string;
  name?: string;
  durationSec: number;
  totalBaseCost?: number;
  totalDiscountedCost?: number;
  discountPercent?: number;
  /** Arte del bundle desde valorant-api.com (best-effort) */
  art?: BundleArt | null;
  items: StoreBundleItemUI[];
}

/** Traduce el ítem resuelto al DTO que consume el cliente. */
function itemUi(item: StoreItem): StoreItemUI {
  switch (item.kind) {
    case 'skin':
      return {
        kind: 'skin',
        id: item.id,
        name: item.name,
        icon: item.icon,
        weapon: item.weapon,
        rarity: item.rarity ?? null,
        rarityColor: item.rarityColor ?? null,
        collection: item.collection ?? null,
        levelCount: item.levelCount,
        variantCount: item.variantCount,
      };
    case 'card':
      return { kind: 'card', id: item.id, name: item.name, icon: item.icon, largeArt: item.largeArt };
    case 'buddy':
      return { kind: 'buddy', id: item.id, name: item.name, icon: item.icon, levels: item.levels };
    case 'spray':
      return {
        kind: 'spray',
        id: item.id,
        name: item.name,
        icon: item.icon,
        fullIcon: item.fullIcon,
        animationGif: item.animationGif,
        animationPng: item.animationPng,
      };
    case 'title':
      return { kind: 'title', id: item.id, name: item.name, icon: '', titleText: item.titleText };
    default:
      return { kind: 'unknown', id: item.id, name: 'Item', icon: '' };
  }
}

export interface StoreStatusResponse {
  source: 'rso' | 'none';
  sourceDetail: string;
  fetchedAt: number;
  dailyRemainingSec: number;
  /** Perfil principal del usuario (null si aún no creó perfiles). */
  profile: { id: string; label: string; name: string; tag: string } | null;
  /** Riot ID de la sesión conectada (null si no se pudo identificar). */
  account: { name: string; tag: string } | null;
  /** true = la sesión es de su principal; false = es otra cuenta; null = sin datos. */
  matchesPrimary: boolean | null;
  daily: StoreDailyItemUI[];
  bundle: StoreBundleUI | null;
  favorites: Array<
    FavoriteSkin & {
      inStoreToday: boolean;
      price?: number;
      notified: boolean;
      rarity?: string | null;
      rarityColor?: string | null;
      collection?: string | null;
      levelCount?: number;
      variantCount?: number;
    }
  >;
  rso: {
    status: 'ok' | 'needs_2fa' | 'needs_cookie';
    needsCode: boolean;
    /** Cuándo se conectó la sesión de tienda (null en sesiones viejas). */
    connectedAt: number | null;
    /** Estimación de caducidad (heurística, según jar completo o solo ssid). */
    estimateExpiresAt: number | null;
    /** true = queda poco para la estimación: conviene reconectar. */
    expiringSoon: boolean;
  };
  push: { enabled: boolean; publicKey: string; subscribed: boolean; count: number };
  error?: string;
}

export async function GET(req: NextRequest) {
  const viewer = viewerFromRequest(req);
  if (!viewer) return Response.json({ error: 'No autenticado', code: 'UNAUTHORIZED' }, { status: 401 });
  const user = viewer.username;

  try {
    // ?refresh=1 fuerza revalidación del storefront del usuario (botón Actualizar).
    const front = req.nextUrl.searchParams.get('refresh') === '1'
      ? await refreshStoreFront(user)
      : await getStoreFront(user);
    const [favorites, catalog] = await Promise.all([getFavorites(user), getSkinsCatalog()]);
    const notifiedIds = notifiedToday(user, front.fetchedAt);

    const favIds = new Set(favorites.map((f) => f.offerId));
    const notifiedSet = new Set(notifiedIds);

    // Las ofertas diarias son siempre skins (skinlevel uuid).
    const daily: StoreDailyItemUI[] = await Promise.all(
      front.daily.map(async (d) => {
        const item = await resolveStoreItem(d.offerId, ITEM_TYPES.skins);
        return { ...itemUi(item), offerId: d.offerId, price: d.price, isFavorite: favIds.has(d.offerId) };
      }),
    );

    const dailyByOffer = new Map(front.daily.map((d) => [d.offerId, d]));
    const favoritesEnriched = favorites.map((f) => {
      const item = dailyByOffer.get(f.offerId);
      const skin = catalog.byId[f.offerId];
      return {
        ...f,
        inStoreToday: !!item,
        price: item?.price,
        notified: notifiedSet.has(f.offerId),
        rarity: skin?.rarity ?? null,
        rarityColor: skin?.rarityColor ?? null,
        collection: skin?.collection ?? null,
        levelCount: skin?.levelCount,
        variantCount: skin?.variantCount,
      };
    });

    // El bundle puede mezclar skins, variantes, cards, buddies, sprays y títulos:
    // cada ítem se resuelve por su uuid (y su ItemTypeID como pista).
    const bundle = front.bundle
      ? {
          ...front.bundle,
          art: await getBundleArt(front.bundle.id),
          items: await Promise.all(
            front.bundle.items.map(async (it) => {
              const item = await resolveStoreItem(it.itemId, it.itemType);
              return { ...itemUi(item), itemId: it.itemId, price: it.price, basePrice: it.basePrice };
            }),
          ),
        }
      : null;

    const cfg = pushConfig();
    const subs = getSubscriptions(user);
    const health = await rsoHealth(user);
    const sourceDetail = front.source === 'rso' ? 'Respaldo RSO' : 'Sin conexión';

    const profiles = listProfilesFor(viewer);
    const primary = profiles.find((p) => p.primary) ?? profiles.find((p) => p.visible) ?? profiles[0] ?? null;
    const account = front.account ?? null;
    const matchesPrimary =
      account && primary
        ? account.name.toLowerCase() === primary.name.toLowerCase() &&
          (account.tag ?? '').toLowerCase() === primary.tag.toLowerCase()
        : null;

    const response: StoreStatusResponse = {
      source: front.source,
      sourceDetail,
      fetchedAt: front.fetchedAt,
      dailyRemainingSec: front.dailyRemainingSec,
      profile: primary ? { id: primary.id, label: primary.label, name: primary.name, tag: primary.tag } : null,
      account,
      matchesPrimary,
      daily,
      bundle,
      favorites: favoritesEnriched,
      rso: {
        status: health.status,
        needsCode: health.status === 'needs_2fa',
        connectedAt: health.connectedAt,
        estimateExpiresAt: health.estimateExpiresAt,
        expiringSoon: health.expiringSoon,
      },
      push: {
        enabled: pushEnabled(),
        publicKey: cfg?.publicKey ?? '',
        subscribed: subs.length > 0,
        count: subs.length,
      },
    };
    return Response.json(response, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
