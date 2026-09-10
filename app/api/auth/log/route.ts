import { NextRequest } from 'next/server';
import { isAdmin, sessionFromRequest } from '@/lib/auth';
import { listAuthLog } from '@/lib/authLog';

export const dynamic = 'force-dynamic';

/** Actividad reciente (solo admin). */
export async function GET(req: NextRequest) {
  const session = sessionFromRequest(req);
  if (!session) return Response.json({ error: 'No autenticado', code: 'UNAUTHORIZED' }, { status: 401 });
  if (!isAdmin(session.u)) return Response.json({ error: 'Solo el administrador' }, { status: 403 });
  const raw = Number(req.nextUrl.searchParams.get('limit') ?? '');
  const limit = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 100;
  return Response.json({ events: listAuthLog(limit) }, { headers: { 'Cache-Control': 'no-store' } });
}
