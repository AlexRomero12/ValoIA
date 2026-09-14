import { NextRequest, NextResponse } from 'next/server';
import {
  changePassword,
  createUser,
  deleteUser,
  getUserPublic,
  isAdmin,
  isDemoAccount,
  listUsers,
  sessionFromRequest,
  verifyCredentials,
} from '@/lib/auth';
import { logAuth } from '@/lib/authLog';
import { clientIp } from '@/lib/clientIp';
import { revokeUserSessions } from '@/lib/sessions';
import { isPublicMode } from '@/lib/appMode';

export const dynamic = 'force-dynamic';

/** Lista de usuarios (admin: todos; usuario: el suyo). */
export async function GET(req: NextRequest) {
  const session = isPublicMode() ? sessionFromRequest(req) : null;
  if (isPublicMode() && !session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const username = session?.u ?? 'invitado';
  if (isAdmin(username)) return NextResponse.json({ users: listUsers() });
  const own = getUserPublic(username);
  return NextResponse.json({ users: own ? [own] : [] });
}

/**
 * Acciones:
 *  - { action: 'password', username?, password, currentPassword? }
 *  - { action: 'create', username, password }   (admin)
 *  - { action: 'delete', username }             (admin)
 */
export async function POST(req: NextRequest) {
  const session = isPublicMode() ? sessionFromRequest(req) : null;
  if (isPublicMode() && !session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const requester = session?.u ?? 'invitado';
  if (isDemoAccount(requester)) {
    return NextResponse.json({ error: 'La cuenta demo es de solo lectura' }, { status: 403 });
  }
  const admin = !isPublicMode() || isAdmin(requester);
  const ip = clientIp(req);

  let body: { action?: string; username?: string; password?: string; currentPassword?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  if (body.action === 'password') {
    const target = admin && body.username ? body.username : requester;
    const self = target === requester;
    if (self && !verifyCredentials(requester, body.currentPassword ?? '')) {
      return NextResponse.json({ error: 'Contraseña actual incorrecta' }, { status: 403 });
    }
    const res = changePassword(target, String(body.password ?? ''), { mustChange: false });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    revokeUserSessions(target);
    logAuth('password_change', { user: target, ip });
    return NextResponse.json({ ok: true });
  }

  if (!admin) return NextResponse.json({ error: 'Solo el administrador' }, { status: 403 });

  if (body.action === 'create') {
    const res = createUser(String(body.username ?? ''), String(body.password ?? ''), { createdIp: ip });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    logAuth('user_create', { user: String(body.username ?? '').trim().toLowerCase(), ip });
    return NextResponse.json({ ok: true, users: res.users });
  }

  if (body.action === 'delete') {
    const res = deleteUser(String(body.username ?? ''), requester);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    logAuth('user_delete', { user: String(body.username ?? '').trim().toLowerCase(), ip });
    return NextResponse.json({ ok: true, users: res.users });
  }

  return NextResponse.json({ error: 'Acción desconocida (password | create | delete)' }, { status: 400 });
}
