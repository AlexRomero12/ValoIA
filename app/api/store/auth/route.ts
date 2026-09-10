import { NextRequest } from 'next/server';
import { rsoLogin, rsoSubmit2fa, rsoStatus, rsoConnectCookie } from '@/lib/riotClient';
import { viewerFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** Login RSO del usuario: {action:'login', username?, password?} | {action:'code', code} | {action:'cookie', ssid} */
export async function POST(req: NextRequest) {
  const viewer = viewerFromRequest(req);
  if (!viewer) return Response.json({ error: 'No autenticado', code: 'UNAUTHORIZED' }, { status: 401 });
  const user = viewer.username;

  let body: { action?: string; username?: string; password?: string; code?: string; ssid?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  try {
    if (body.action === 'login') {
      const result = await rsoLogin(user, body.username, body.password);
      if (result.ok) return Response.json({ ok: true, status: await rsoStatus(user) });
      return Response.json({ ok: false, needs2fa: result.needs2fa, error: result.error }, { status: result.needs2fa ? 200 : 400 });
    }
    if (body.action === 'code') {
      const result = await rsoSubmit2fa(user, body.code ?? '');
      if (result.ok) return Response.json({ ok: true, status: await rsoStatus(user) });
      return Response.json({ ok: false, error: result.error }, { status: 400 });
    }
    if (body.action === 'cookie') {
      const result = await rsoConnectCookie(user, body.ssid ?? '');
      if (result.ok) return Response.json({ ok: true, status: await rsoStatus(user) });
      return Response.json({ ok: false, error: result.error }, { status: 400 });
    }
    return Response.json({ error: 'Acción desconocida (login | code | cookie)' }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
