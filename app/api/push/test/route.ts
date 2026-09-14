import { NextRequest } from 'next/server';
import { pushEnabled, getSubscriptions, sendPush } from '@/lib/push';
import { viewerOrSingle } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** POST -> envía una notificación de prueba a los dispositivos del usuario. */
export async function POST(req: NextRequest) {
  const viewer = viewerOrSingle(req);
  if (!viewer) return Response.json({ error: 'No autenticado', code: 'UNAUTHORIZED' }, { status: 401 });
  if (!pushEnabled()) {
    return Response.json({ error: 'Web Push no configurado (faltan VAPID keys)' }, { status: 400 });
  }
  const subs = getSubscriptions(viewer.username);
  if (subs.length === 0) {
    return Response.json({ error: 'No hay suscripciones: activa las notificaciones primero' }, { status: 400 });
  }
  const result = await sendPush(
    { title: 'Prueba de notificaciones', body: 'Así se verá el aviso semanal de reglas.', url: '/reglas' },
    viewer.username,
  );
  return Response.json({ ok: true, sent: result.sent, failed: result.failed, subscriptions: subs.length });
}
