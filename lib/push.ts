import webpush from 'web-push';
import { env } from './env';
import { readData, writeData } from './persist';

/**
 * Web Push para avisar cuando una skin favorita aparece en la tienda.
 *
 * Las suscripciones del navegador viven en `data/push-subscriptions.json`
 * (persistente, externo al cache). El envío lo dispara el cron de
 * instrumentation.ts cuando detecta una favorita en la tienda de hoy.
 */

export interface PushSubscriptionData {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
  createdAt: number;
}

interface SubscriptionsFile {
  subscriptions: PushSubscriptionData[];
}

const SUBS_FILE = 'push-subscriptions.json';

function readSubs(): PushSubscriptionData[] {
  const file = readData<SubscriptionsFile>(SUBS_FILE, { subscriptions: [] });
  return Array.isArray(file?.subscriptions) ? file.subscriptions : [];
}

function writeSubs(subs: PushSubscriptionData[]): void {
  writeData(SUBS_FILE, { subscriptions: subs });
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

export function getSubscriptions(): PushSubscriptionData[] {
  return readSubs();
}

/** Registra (o renueva) una suscripción; dedupe por endpoint. */
export function addSubscription(sub: Omit<PushSubscriptionData, 'createdAt'>): PushSubscriptionData[] {
  const current = readSubs().filter((s) => s.endpoint !== sub.endpoint);
  const next = [...current, { ...sub, createdAt: Date.now() }];
  writeSubs(next);
  return next;
}

export function removeSubscription(endpoint: string): PushSubscriptionData[] {
  const next = readSubs().filter((s) => s.endpoint !== endpoint);
  writeSubs(next);
  return next;
}

export interface PushResult {
  sent: number;
  failed: number;
}

/** Envía la notificación a todas las suscripciones; las fallidas se limpian. */
export async function sendPush(payload: { title: string; body: string; icon?: string; url?: string }): Promise<PushResult> {
  const cfg = pushConfig();
  if (!cfg) return { sent: 0, failed: 0 };
  webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);

  const subs = readSubs();
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

  if (dead.length) writeSubs(subs.filter((s) => !dead.includes(s.endpoint)));
  return { sent, failed };
}