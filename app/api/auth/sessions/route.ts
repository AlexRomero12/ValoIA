import { NextRequest, NextResponse } from 'next/server';
import { isAdmin, sessionFromRequest } from '@/lib/auth';
import { listSessions, revokeSession } from '@/lib/sessions';
import { clientIp } from '@/lib/clientIp';
import { logAuth } from '@/lib/authLog';
import { isPublicMode } from '@/lib/appMode';

export const dynamic = 'force-dynamic';

/** GET: sesiones propias (?user=all solo admin). */
export async function GET(req: NextRequest) {
  const session = isPublicMode() ? sessionFromRequest(req) : null;
  if (isPublicMode() && !session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const requester = session?.u ?? 'invitado';
  const wantAll = req.nextUrl.searchParams.get('user') === 'all';
  const records = wantAll && isAdmin(requester) ? listSessions() : listSessions(requester);
  return NextResponse.json({ sessions: records });
}

/** DELETE ?id=: cierra una sesión (propia; admin cualquiera). */
export async function DELETE(req: NextRequest) {
  const session = isPublicMode() ? sessionFromRequest(req) : null;
  if (isPublicMode() && !session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const requester = session?.u ?? 'invitado';
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 });
  const ok = revokeSession(id, isAdmin(requester) ? undefined : requester);
  if (!ok) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 });
  logAuth('sessions_revoke', { user: requester, ip: clientIp(req), detail: id });
  return NextResponse.json({ ok: true });
}
