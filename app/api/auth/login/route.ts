import { NextRequest, NextResponse } from 'next/server';
import { authConfigured, ensureSeedUser, mustChangePassword, startSession, verifyCredentials } from '@/lib/auth';
import { logAuth } from '@/lib/authLog';
import { clientIp } from '@/lib/clientIp';
import { clearRateLimit, rateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * Login con rate-limit por IP, por usuario y por par IP+usuario.
 * Si no hay AUTH_SECRET (producción) responde 503 con instrucciones.
 */

function tooMany(retryAfterSec: number | undefined) {
  return Response.json(
    { error: 'Demasiados intentos. Espera unos minutos.' },
    { status: 429, headers: retryAfterSec ? { 'Retry-After': String(retryAfterSec) } : undefined },
  );
}

export async function POST(req: NextRequest) {
  if (!authConfigured()) {
    return Response.json(
      {
        error: 'Falta AUTH_SECRET en el servidor. Genera uno con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))" y reinicia.',
        code: 'AUTH_NOT_CONFIGURED',
      },
      { status: 503 },
    );
  }

  let body: { username?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body JSON inválido' }, { status: 400 });
  }
  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '');
  if (!username || !password) {
    return Response.json({ error: 'Usuario y contraseña requeridos' }, { status: 400 });
  }
  if (username.length > 64 || password.length > 128) {
    return Response.json({ error: 'Usuario o contraseña incorrectos' }, { status: 401 });
  }

  const ip = clientIp(req);
  const userKey = username.toLowerCase();
  const pairKey = `login:pair:${ip}:${userKey}`;

  // Del más específico al más amplio.
  const checks: [string, number, number][] = [
    [pairKey, 5, 10 * 60_000],
    [`login:user:${userKey}`, 10, 15 * 60_000],
    [`login:ip:${ip}`, 30, 15 * 60_000],
  ];
  for (const [key, max, windowMs] of checks) {
    const r = rateLimit(key, max, windowMs);
    if (!r.ok) {
      logAuth('login_blocked', { user: userKey, ip });
      return tooMany(r.retryAfterSec);
    }
  }

  // Primer arranque: crea el usuario inicial desde AUTH_USER/AUTH_PASSWORD si no hay ninguno.
  ensureSeedUser();

  if (!verifyCredentials(username, password)) {
    logAuth('login_fail', { user: userKey, ip });
    return Response.json({ error: 'Usuario o contraseña incorrectos' }, { status: 401 });
  }

  clearRateLimit(pairKey);
  logAuth('login_ok', { user: userKey, ip });
  const res = NextResponse.json({
    ok: true,
    user: { username: userKey },
    mustChangePassword: mustChangePassword(userKey),
  });
  if (!startSession(res, userKey, req)) {
    return Response.json({ error: 'No se pudo iniciar la sesión', code: 'AUTH_NOT_CONFIGURED' }, { status: 503 });
  }
  return res;
}
