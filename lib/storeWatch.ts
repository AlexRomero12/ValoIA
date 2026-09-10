import { getFavorites } from './favorites';
import { refreshStoreFront } from './riotClient';
import { getSubscriptions, pushEnabled, sendPush } from './push';
import { readData, writeDataSync } from './persist';

/**
 * Vigilancia de la tienda POR USUARIO (la ejecuta el cron de instrumentation.ts):
 *  - recorre los usuarios con suscripciones push y favoritas
 *  - refresca el storefront de cada uno (RSO propio)
 *  - avisa a SUS dispositivos cuando una favorita aparece en SU tienda
 *    (dedupe diario en `data/store-notified.<usuario>.json`, sin spam)
 */

interface NotifiedFile {
  /** fecha UTC (YYYY-MM-DD) de la tienda notificada */
  day: string;
  offerIds: string[];
}

function safeUser(user: string): string {
  return user.toLowerCase().replace(/[^a-z0-9._-]/g, '_');
}

function notifiedFile(user: string): string {
  return `store-notified.${safeUser(user)}.json`;
}

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
  users: number;
}

const EMPTY: WatchResult = {
  checked: false,
  source: 'none',
  daily: 0,
  favorites: 0,
  matches: [],
  notified: [],
  sent: 0,
  failed: 0,
  skipped: '',
  users: 0,
};

export async function watchStoreAndNotify(): Promise<WatchResult> {
  if (!pushEnabled()) return { ...EMPTY, skipped: 'push desactivado' };
  const allSubs = getSubscriptions();
  if (allSubs.length === 0) return { ...EMPTY, skipped: 'sin suscripciones push' };

  const users = [...new Set(allSubs.map((s) => s.user).filter(Boolean))];
  let sent = 0;
  let failed = 0;
  let checked = false;
  let source = 'none';
  let daily = 0;
  let favoritesTotal = 0;
  const matches: string[] = [];
  const notified: string[] = [];

  for (const user of users) {
    const favorites = await getFavorites(user);
    if (favorites.length === 0) continue;

    const front = await refreshStoreFront(user);
    if (front.source === 'none' || front.daily.length === 0) continue;

    checked = true;
    source = front.source;
    daily += front.daily.length;
    favoritesTotal += favorites.length;

    const favIds = new Set(favorites.map((f) => f.offerId));
    const inStore = front.daily.filter((d) => favIds.has(d.offerId));
    const today = utcDay(front.fetchedAt);
    const file = notifiedFile(user);
    const notifiedState = readData<NotifiedFile>(file, { day: '', offerIds: [] });
    const freshDay = notifiedState.day !== today ? { day: today, offerIds: [] as string[] } : notifiedState;

    const toNotify = inStore.filter((d) => !freshDay.offerIds.includes(d.offerId));
    if (toNotify.length > 0) {
      const byId = new Map(favorites.map((f) => [f.offerId, f]));
      for (const item of toNotify) {
        const fav = byId.get(item.offerId);
        const res = await sendPush(
          {
            title: 'Skin favorita en la tienda',
            body: `${fav?.name ?? 'Tu skin favorita'} está disponible hoy${item.price ? ` por ${item.price} VP` : ''}.`,
            icon: fav?.icon || undefined,
            url: '/tienda',
          },
          user,
        );
        sent += res.sent;
        failed += res.failed;
        freshDay.offerIds.push(item.offerId);
        matches.push(`${user}:${item.offerId}`);
      }
      writeDataSync(file, freshDay);
    }
    notified.push(...freshDay.offerIds.map((id) => `${user}:${id}`));
  }

  if (!checked) {
    return { ...EMPTY, users: users.length, sent, failed, skipped: 'sin tienda disponible o sin favoritas' };
  }
  return { checked, source, daily, favorites: favoritesTotal, matches, notified, sent, failed, skipped: '', users: users.length };
}

/** Coincidencias notificadas hoy (para mostrar "ya notificado" en la página). */
export function notifiedToday(user: string, fetchedAt: number): string[] {
  const notified = readData<NotifiedFile>(notifiedFile(user), { day: '', offerIds: [] });
  if (notified.day !== utcDay(fetchedAt)) return [];
  return notified.offerIds;
}
