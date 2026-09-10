import webpush from 'web-push';
import { env } from './env';
import { readData, writeDataSync } from './persist';
import { adminUsername } from './auth';

/**
 * Web Push POR USUARIO.
 *
 * Cada suscripción del navegador pertenece a un usuario (`user`); el envío
 * filtra por destinatario. Las suscripciones previas (sin usuario) migran al
 * admin. Persisten en `data/push-subscriptions.json` (volumen `valo-data`).
 */

export interface PushSubscriptionData {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
  createdAt: number;
  /** usuario dueño de la suscripción (el navegador donde inició sesión) */
  user: string;
}

interface SubscriptionsFile {
  subscriptions: PushSubscriptionData[];
}

const SUBS_FILE = 'push-subscriptions.json';
const MAX_PER_USER = 5;

function writeSubs(subs: PushSubscriptionData[]): void {
  writeDataSync(SUBS_FILE, { subscriptions: subs });
}

function readSubs(): PushSubscriptionData[] {
  const file = readData<SubscriptionsFile>(SUBS_FILE, { subscriptions: [] });
  const subs = Array.isArray(file?.subscriptions) ? file.subscriptions : [];
  // Migración: suscripciones previas al flag de usuario -> admin.
  const legacy = subs.filter((s) => s && !s.user);
  if (legacy.length > 0) {
    const owner = adminUsername() ?? 'admin';
    const next = subs.map((s) => (s && !s.user ? { ...s, user: owner } : s));
    writeSubs(next);
    return next;
  }
  return subs;
}

export function pushConfig(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = env('VAPID_PUBLIC_KEY');
  const privateKey = env('VAPID_PRIVATE_KEY');
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: env('VAPID_SUBJECT', 'mailto:valoia@localhost') };
}

export function pushEnabled(): boolean {
  return pushConfig() != null;
}

/** Suscripciones de un usuario (o todas, uso interno del admin/cron global). */
export function getSubscriptions(user?: string): PushSubscriptionData[] {
  const subs = readSubs();
  return user ? subs.filter((s) => s.user === user) : subs;
}

/**
 * Registra (o renueva) una suscripción del usuario; dedupe por endpoint.
 * Un mismo navegador con otra sesión reasigna la suscripción al nuevo usuario.
 */
export function addSubscription(sub: Omit<PushSubscriptionData, 'createdAt' | 'user'>, user: string): PushSubscriptionData[] {
  const current = readSubs().filter((s) => s.endpoint !== sub.endpoint);
  // Tope por usuario: si excede, se descarta la más antigua suya.
  const mine = current.filter((s) => s.user === user).sort((a, b) => a.createdAt - b.createdAt);
  let kept = current;
  if (mine.length >= MAX_PER_USER) {
    const drop = new Set(mine.slice(0, mine.length - MAX_PER_USER + 1).map((s) => s.endpoint));
    kept = current.filter((s) => !drop.has(s.endpoint));
  }
  const next = [...kept, { ...sub, user, createdAt: Date.now() }];
  writeSubs(next);
  return next;
}

export function removeSubscription(endpoint: string, user?: string): PushSubscriptionData[] {
  const next = readSubs().filter((s) => s.endpoint !== endpoint || (user != null && s.user !== user));
  writeSubs(next);
  return next;
}

/** Borra todas las suscripciones de un usuario (al eliminarlo). */
export function removeUserSubscriptions(user: string): number {
  const subs = readSubs();
  const next = subs.filter((s) => s.user !== user);
  if (next.length === subs.length) return 0;
  writeSubs(next);
  return subs.length - next.length;
}

export interface PushResult {
  sent: number;
  failed: number;
}

/** Envía la notificación a las suscripciones del usuario (o a todas). */
export async function sendPush(
  payload: { title: string; body: string; icon?: string; url?: string },
  user?: string,
): Promise<PushResult> {
  const cfg = pushConfig();
  if (!cfg) return { sent: 0, failed: 0 };
  webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);

  const subs = getSubscriptions(user);
  let sent = 0;
  let failed = 0;
  const dead: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, expirationTime: sub.expirationTime, keys: sub.keys },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 4 },
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number })?.statusCode;
        // 404/410: la suscripción ya no existe -> se limpia.
        if (code === 404 || code === 410) dead.push(sub.endpoint);
        else console.error(`[push] envío fallido a ${sub.endpoint}: ${e instanceof Error ? e.message : String(e)}`);
        failed++;
      }
    }),
  );

  if (dead.length) writeSubs(readSubs().filter((s) => !dead.includes(s.endpoint)));
  return { sent, failed };
}
