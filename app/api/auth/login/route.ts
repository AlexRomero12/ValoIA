import { NextRequest, NextResponse } from 'next/server';
import { authConfigured, ensureSeedUser, mustChangePassword, startSession, verifyCredentials } from '@/lib/auth';
import { logAuth } from '@/lib/authLog';
import { clientIp } from '@/lib/clientIp';
import { rateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/** Inicio de sesión (cuenta local). Rate-limit por IP+usuario, usuario e IP. */
export async function POST(req: NextRequest) {
  ensureSeedUser();
  if (!authConfigured()) {
    return NextResponse.json(
      { error: 'Falta AUTH_SECRET en el entorno (firma de sesiones)', code: 'NOT_CONFIGURED' },
      { status: 500 },
    );
  }
  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }
  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '');
  if (!username || !password) return NextResponse.json({ error: 'Faltan credenciales' }, { status: 400 });

  const ip = clientIp(req);
  const buckets = [
    rateLimit(`login:pair:${ip}:${username.toLowerCase()}`, 5, 10 * 60 * 1000),
    rateLimit(`login:user:${username.toLowerCase()}`, 10, 15 * 60 * 1000),
    rateLimit(`login:ip:${ip}`, 30, 15 * 60 * 1000),
  ];
  for (const rl of buckets) {
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Demasiados intentos. Espera ${rl.retryAfterSec}s`, code: 'RATE_LIMITED' },
        { status: 429, headers: rl.retryAfterSec ? { 'Retry-After': String(rl.retryAfterSec) } : undefined },
      );
    }
  }

  if (!verifyCredentials(username, password)) {
    logAuth('login_fail', { user: username.toLowerCase(), ip });
    return NextResponse.json({ error: 'Credenciales inválidas', code: 'INVALID' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, mustChangePassword: mustChangePassword(username) });
  const sid = startSession(res, username, req);
  if (!sid) return NextResponse.json({ error: 'No se pudo iniciar sesión' }, { status: 500 });
  logAuth('login_ok', { user: username.toLowerCase(), ip });
  return res;
}
