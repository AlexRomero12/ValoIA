import { NextRequest } from 'next/server';
import { getStoreFront, refreshStoreFront, rsoStatus } from '@/lib/riotClient';
import { getFavorites, type FavoriteSkin } from '@/lib/favorites';
import { getSkinsCatalog } from '@/lib/skins';
import { pushEnabled, pushConfig, getSubscriptions } from '@/lib/push';
import { notifiedToday } from '@/lib/storeWatch';

export const dynamic = 'force-dynamic';

export interface StoreStatusResponse {
  source: 'local' | 'rso' | 'none';
  sourceDetail: string;
  fetchedAt: number;
  dailyRemainingSec: number;
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
  try {
    // ?refresh=1 fuerza revalidación del storefront (botón Actualizar).
    const front = req.nextUrl.searchParams.get('refresh') === '1'
      ? await refreshStoreFront()
      : await getStoreFront();
    const [favorites, catalog] = await Promise.all([getFavorites(), getSkinsCatalog()]);
    const notifiedIds = notifiedToday(front.fetchedAt);

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
    const subs = getSubscriptions();
    const rso = await rsoStatus();
    const sourceDetail =
      front.source === 'local'
        ? 'Riot Client local'
        : front.source === 'rso'
          ? 'Respaldo RSO'
          : 'Sin conexión';

    const response: StoreStatusResponse = {
      source: front.source,
      sourceDetail,
      fetchedAt: front.fetchedAt,
      dailyRemainingSec: front.dailyRemainingSec,
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