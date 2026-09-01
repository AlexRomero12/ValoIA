import { pushEnabled, getSubscriptions, sendPush } from '@/lib/push';
import { getFavorites } from '@/lib/favorites';

export const dynamic = 'force-dynamic';

/** POST -> envía una notificación de prueba a todas las suscripciones. */
export async function POST() {
  if (!pushEnabled()) {
    return Response.json({ error: 'Web Push no configurado (faltan VAPID keys)' }, { status: 400 });
  }
  const subs = getSubscriptions();
  if (subs.length === 0) {
    return Response.json({ error: 'No hay suscripciones: activa las notificaciones primero' }, { status: 400 });
  }
  let body = 'Así se ve el aviso cuando una favorita entra a la tienda.';
  let icon: string | undefined;
  try {
    const favs = await getFavorites();
    if (favs[0]) {
      body = `${favs[0].name} — así se ve el aviso de favoritas (prueba).`;
      icon = favs[0].icon || undefined;
    }
  } catch {
    /* sin favoritas: mensaje genérico */
  }
  const result = await sendPush({ title: 'Prueba de notificaciones', body, icon, url: '/tienda' });
  return Response.json({ ok: true, sent: result.sent, failed: result.failed, subscriptions: subs.length });
}