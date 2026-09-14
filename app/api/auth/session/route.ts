import { NextRequest } from 'next/server';
import { getUser, isAdmin, mustChangePassword, sessionFromRequest, userCount } from '@/lib/auth';
import { appMode, isPublicMode } from '@/lib/appMode';

export const dynamic = 'force-dynamic';

/** Sesión actual: usuario, admin, cambio de contraseña y estado Riot/consent. */
export async function GET(req: NextRequest) {
  const session = sessionFromRequest(req);
  if (!session) {
    // Modo single: no hay sesión; se informa un usuario sintético para la UI.
    if (!isPublicMode()) {
      return Response.json({ user: { username: 'invitado' }, admin: true, mustChangePassword: false, single: true, mode: 'single' });
    }
    return Response.json({ error: 'No autenticado', code: 'UNAUTHORIZED' }, { status: 401 });
  }
  const user = getUser(session.u);
  return Response.json({
    user: { username: session.u },
    admin: isAdmin(session.u),
    mustChangePassword: mustChangePassword(session.u),
    users: isAdmin(session.u) ? userCount() : undefined,
    mode: appMode(),
    riot: user?.riot ? { gameName: user.riot.gameName, tagLine: user.riot.tagLine, mock: user.riot.mock } : null,
    consentAt: user?.consentAt ?? null,
    publicProfile: user?.publicProfile === true,
  });
}
