import { getFavorites } from './favorites';
import { refreshStoreFront } from './riotClient';
import { getSubscriptions, pushEnabled, sendPush } from './push';
import { readData, writeData } from './persist';

/**
 * Vigilancia de la tienda (la ejecuta el cron de instrumentation.ts):
 *  - refresca el storefront (local primero, RSO como respaldo)
 *  - compara las favoritas con la tienda de hoy
 *  - si hay coincidencias NO notificadas hoy, envía un Web Push por cada una
 *    (dedupe en data/store-notified.json para no spamear cada hora)
 */

interface NotifiedFile {
  /** fecha UTC (YYYY-MM-DD) de la tienda notificada */
  day: string;
  offerIds: string[];
}

const NOTIFIED_FILE = 'store-notified.json';

function utcDay(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export interface WatchResult {
  checked: boolean;
  source: string;
  daily: number;
  favorites: number;
  matches: string[];
  notified: string[];
  sent: number;
  failed: number;
  skipped: string;
}

export async function watchStoreAndNotify(): Promise<WatchResult> {
  const favorites = await getFavorites();
  if (favorites.length === 0) {
    return { checked: false, source: 'none', daily: 0, favorites: 0, matches: [], notified: [], sent: 0, failed: 0, skipped: 'sin favoritas' };
  }
  if (!pushEnabled()) {
    return { checked: false, source: 'none', daily: 0, favorites: 0, matches: [], notified: [], sent: 0, failed: 0, skipped: 'push desactivado' };
  }
  if (getSubscriptions().length === 0) {
    return { checked: false, source: 'none', daily: 0, favorites: 0, matches: [], notified: [], sent: 0, failed: 0, skipped: 'sin suscripciones push' };
  }

  const front = await refreshStoreFront();
  if (front.source === 'none' || front.daily.length === 0) {
    return { checked: false, source: 'none', daily: 0, favorites: 0, matches: [], notified: [], sent: 0, failed: 0, skipped: 'tienda no disponible' };
  }

  const favIds = new Set(favorites.map((f) => f.offerId));
  const inStore = front.daily.filter((d) => favIds.has(d.offerId));
  const today = utcDay(front.fetchedAt);
  const notified = readData<NotifiedFile>(NOTIFIED_FILE, { day: '', offerIds: [] });
  const freshDay = notified.day !== today ? { day: today, offerIds: [] as string[] } : notified;

  const toNotify = inStore.filter((d) => !freshDay.offerIds.includes(d.offerId));

  let sent = 0;
  let failed = 0;
  if (toNotify.length > 0) {
    const byId = new Map(favorites.map((f) => [f.offerId, f]));
    for (const item of toNotify) {
      const fav = byId.get(item.offerId);
      const res = await sendPush({
        title: 'Skin favorita en la tienda',
        body: `${fav?.name ?? 'Tu skin favorita'} está disponible hoy${item.price ? ` por ${item.price} VP` : ''}.`,
        icon: fav?.icon || undefined,
        url: '/tienda',
      });
      sent += res.sent;
      failed += res.failed;
      freshDay.offerIds.push(item.offerId);
    }
    writeData(NOTIFIED_FILE, freshDay);
  }

  return {
    checked: true,
    source: front.source,
    daily: front.daily.length,
    favorites: favorites.length,
    matches: inStore.map((d) => d.offerId),
    notified: freshDay.offerIds,
    sent,
    failed,
    skipped: '',
  };
}

/** Coincidencias del día actual (para mostrar "ya notificado" en la página). */
export function notifiedToday(fetchedAt: number): string[] {
  const notified = readData<NotifiedFile>(NOTIFIED_FILE, { day: '', offerIds: [] });
  if (notified.day !== utcDay(fetchedAt)) return [];
  return notified.offerIds;
}