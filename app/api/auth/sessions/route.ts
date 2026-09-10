import { NextRequest } from 'next/server';
import { isAdmin, sessionFromRequest } from '@/lib/auth';
import { listSessions, revokeSession } from '@/lib/sessions';

export const dynamic = 'force-dynamic';

/** Sesiones activas del usuario (el admin puede ver las de `?user=`). */
export async function GET(req: NextRequest) {
  const session = sessionFromRequest(req);
  if (!session) return Response.json({ error: 'No autenticado', code: 'UNAUTHORIZED' }, { status: 401 });
  const admin = isAdmin(session.u);
  const requested = req.nextUrl.searchParams.get('user')?.toLowerCase();
  const all = admin && requested === 'all';
  const user = admin && requested && !all ? requested : session.u;
  const sessions = (all ? listSessions() : listSessions(user)).map((s) => ({
    id: s.id,
    user: s.user,
    ip: s.ip,
    ua: s.ua,
    createdAt: s.createdAt,
    lastSeenAt: s.lastSeenAt,
    current: s.id === session.sid,
  }));
  return Response.json({ sessions, self: session.u, admin, scope: all ? 'all' : user }, { headers: { 'Cache-Control': 'no-store' } });
}

/** Cierra una sesión por id (la propia; el admin, cualquiera). */
export async function DELETE(req: NextRequest) {
  const session = sessionFromRequest(req);
  if (!session) return Response.json({ error: 'No autenticado', code: 'UNAUTHORIZED' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return Response.json({ error: 'Falta id' }, { status: 400 });
  const admin = isAdmin(session.u);
  const ok = revokeSession(id, admin ? undefined : session.u);
  if (!ok) return Response.json({ error: 'Sesión no encontrada' }, { status: 404 });
  return Response.json({ ok: true });
}
