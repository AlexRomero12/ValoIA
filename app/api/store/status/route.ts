import { NextRequest } from 'next/server';
import { getStoreFront, refreshStoreFront, rsoStatus } from '@/lib/riotClient';
import { getFavorites, type FavoriteSkin } from '@/lib/favorites';
import { getSkinsCatalog } from '@/lib/skins';
import { pushEnabled, pushConfig, getSubscriptions } from '@/lib/push';
import { notifiedToday } from '@/lib/storeWatch';
import { listProfilesFor } from '@/lib/profiles';
import { viewerFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

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
  daily: Array<{
    offerId: string;
    price: number;
    name: string;
    icon: string;
    weapon: string;
    isFavorite: boolean;
  }>;
  bundle: {
    id: string;
    name?: string;
    durationSec: number;
    totalBaseCost?: number;
    totalDiscountedCost?: number;
    discountPercent?: number;
    items: Array<{ itemId: string; price?: number; name: string; icon: string; weapon: string }>;
  } | null;
  favorites: Array<FavoriteSkin & { inStoreToday: boolean; price?: number; notified: boolean }>;
  rso: { status: 'ok' | 'needs_2fa' | 'needs_cookie'; needsCode: boolean };
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

    const daily = front.daily.map((d) => {
      const skin = catalog.byId.get(d.offerId);
      return {
        offerId: d.offerId,
        price: d.price,
        name: skin?.name ?? 'Skin',
        icon: skin?.icon ?? '',
        weapon: skin?.weapon ?? '',
        isFavorite: favIds.has(d.offerId),
      };
    });

    const dailyByOffer = new Map(front.daily.map((d) => [d.offerId, d]));
    const favoritesEnriched = favorites.map((f) => {
      const item = dailyByOffer.get(f.offerId);
      return {
        ...f,
        inStoreToday: !!item,
        price: item?.price,
        notified: notifiedSet.has(f.offerId),
      };
    });

    const bundle = front.bundle
      ? {
          ...front.bundle,
          items: front.bundle.items.map((it) => {
            const skin = catalog.byId.get(it.itemId);
            return {
              itemId: it.itemId,
              price: it.price,
              name: skin?.name ?? 'Item',
              icon: skin?.icon ?? '',
              weapon: skin?.weapon ?? '',
            };
          }),
        }
      : null;

    const cfg = pushConfig();
    const subs = getSubscriptions(user);
    const rso = await rsoStatus(user);
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
      rso: { status: rso, needsCode: rso === 'needs_2fa' },
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
