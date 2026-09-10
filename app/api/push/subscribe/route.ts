import { NextRequest } from 'next/server';
import { addSubscription, removeSubscription, pushEnabled, type PushSubscriptionData } from '@/lib/push';
import { viewerFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

interface SubBody {
  endpoint?: string;
  expirationTime?: number | null;
  keys?: { p256dh?: string; auth?: string };
}

export async function POST(req: NextRequest) {
  const viewer = viewerFromRequest(req);
  if (!viewer) return Response.json({ error: 'No autenticado', code: 'UNAUTHORIZED' }, { status: 401 });
  if (!pushEnabled()) {
    return Response.json({ error: 'Web Push no configurado (faltan VAPID keys en .env)' }, { status: 400 });
  }
  let body: SubBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body JSON inválido' }, { status: 400 });
  }
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return Response.json({ error: 'Suscripción incompleta' }, { status: 400 });
  }
  if (!body.endpoint.startsWith('https://')) {
    return Response.json({ error: 'Endpoint de push inválido' }, { status: 400 });
  }
  const sub: Omit<PushSubscriptionData, 'createdAt' | 'user'> = {
    endpoint: body.endpoint,
    expirationTime: body.expirationTime ?? null,
    keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
  };
  const subs = addSubscription(sub, viewer.username);
  return Response.json({ ok: true, count: subs.filter((s) => s.user === viewer.username).length });
}

export async function DELETE(req: NextRequest) {
  const viewer = viewerFromRequest(req);
  if (!viewer) return Response.json({ error: 'No autenticado', code: 'UNAUTHORIZED' }, { status: 401 });
  const endpoint = req.nextUrl.searchParams.get('endpoint');
  if (!endpoint) return Response.json({ error: 'Falta endpoint' }, { status: 400 });
  const subs = removeSubscription(endpoint, viewer.username);
  return Response.json({ ok: true, count: subs.filter((s) => s.user === viewer.username).length });
}
