import { NextRequest } from 'next/server';
import {
  changePassword,
  createUser,
  deleteUser,
  isAdmin,
  listUsers,
  sessionFromRequest,
  verifyCredentials,
  type UserResult,
} from '@/lib/auth';
import { logAuth, type AuthEventType } from '@/lib/authLog';
import { revokeUserSessions } from '@/lib/sessions';
import { cleanupUserData } from '@/lib/userCleanup';
import { clientIp } from '@/lib/clientIp';

export const dynamic = 'force-dynamic';

/**
 * Gestión de usuarios:
 *  - admin: lista todos, crea (con cambio forzado), borra y resetea contraseñas.
 *  - usuario normal: solo cambia su propia contraseña (verificando la actual).
 * Los resets revocan las sesiones del afectado.
 */

function scopeUsers<T extends { username: string }>(users: T[], username: string, admin: boolean): T[] {
  return admin ? users : users.filter((u) => u.username === username);
}

export async function GET(req: NextRequest) {
  const session = sessionFromRequest(req);
  if (!session) return Response.json({ error: 'No autenticado', code: 'UNAUTHORIZED' }, { status: 401 });
  const admin = isAdmin(session.u);
  return Response.json(
    { users: scopeUsers(listUsers(), session.u, admin), self: session.u, admin },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(req: NextRequest) {
  const session = sessionFromRequest(req);
  if (!session) return Response.json({ error: 'No autenticado', code: 'UNAUTHORIZED' }, { status: 401 });
  const admin = isAdmin(session.u);

  let body: { action?: string; username?: unknown; password?: unknown; currentPassword?: unknown; mustChange?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '');
  if (!username) return Response.json({ error: 'Falta el usuario' }, { status: 400 });

  let result: UserResult;
  let event: AuthEventType | null = null;
  let eventDetail: string | undefined;

  if (body.action === 'create') {
    if (!admin) return Response.json({ error: 'Solo el administrador puede crear usuarios' }, { status: 403 });
    result = createUser(username, password, {
      createdIp: clientIp(req),
      // Contraseña temporal: se fuerza el cambio al primer login (salvo indicación).
      mustChangePassword: body.mustChange !== false,
    });
    event = 'user_create';
    eventDetail = username.toLowerCase();
  } else if (body.action === 'password') {
    const isSelf = username.toLowerCase() === session.u;
    const isAdminReset = admin && !isSelf;
    if (!isSelf && !admin) {
      return Response.json({ error: 'Solo puedes cambiar tu propia contraseña' }, { status: 403 });
    }
    if (isSelf) {
      const current = String(body.currentPassword ?? '');
      if (!current || !verifyCredentials(session.u, current)) {
        return Response.json({ error: 'La contraseña actual no es correcta' }, { status: 400 });
      }
    }
    result = changePassword(username, password, { mustChange: isAdminReset });
    event = 'password_change';
    eventDetail = isSelf ? 'self' : `reset ${username.toLowerCase()}`;
    if (result.ok) {
      // Resets del admin: fuera todas. Cambio propio: fuera las demás, conserva la actual.
      revokeUserSessions(username.toLowerCase(), isSelf ? session.sid : undefined);
    }
  } else if (body.action === 'delete') {
    if (!admin) return Response.json({ error: 'Solo el administrador puede borrar usuarios' }, { status: 403 });
    result = deleteUser(username, session.u);
    event = 'user_delete';
    eventDetail = username.toLowerCase();
    if (result.ok) cleanupUserData(username.toLowerCase());
  } else {
    return Response.json({ error: 'Acción desconocida (create | password | delete)' }, { status: 400 });
  }

  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  if (event) logAuth(event, { user: session.u, ip: clientIp(req), detail: eventDetail });
  return Response.json({ ok: true, users: scopeUsers(result.users, session.u, admin), self: session.u, admin });
}
