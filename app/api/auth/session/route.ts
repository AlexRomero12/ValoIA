import { NextRequest } from 'next/server';
import { isAdmin, mustChangePassword, sessionFromRequest, userCount } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** Usuario de la sesión actual (para el TopBar y los permisos de UI). */
export async function GET(req: NextRequest) {
  const session = sessionFromRequest(req);
  if (!session) {
    return Response.json({ error: 'No autenticado', code: 'UNAUTHORIZED' }, { status: 401 });
  }
  return Response.json(
    {
      user: { username: session.u },
      admin: isAdmin(session.u),
      mustChangePassword: mustChangePassword(session.u),
      users: userCount(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
