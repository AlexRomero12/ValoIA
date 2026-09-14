import { NextRequest, NextResponse } from 'next/server';
import { authConfigured, createUser, startSession } from '@/lib/auth';
import { logAuth } from '@/lib/authLog';
import { clientIp } from '@/lib/clientIp';
import { rateLimit } from '@/lib/rateLimit';
import { isPublicMode } from '@/lib/appMode';

export const dynamic = 'force-dynamic';

/** Registro abierto (solo modo público). Crea la cuenta y abre sesión. */
export async function POST(req: NextRequest) {
  if (!isPublicMode()) {
    return NextResponse.json({ error: 'El registro está deshabilitado en esta instancia', code: 'DISABLED' }, { status: 403 });
  }
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
  const username = String(body.username ?? '');
  const password = String(body.password ?? '');

  const ip = clientIp(req);
  const rl = rateLimit(`register:${ip}`, 3, 60 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Demasiados registros desde esta IP. Espera ${rl.retryAfterSec}s`, code: 'RATE_LIMITED' },
      { status: 429, headers: rl.retryAfterSec ? { 'Retry-After': String(rl.retryAfterSec) } : undefined },
    );
  }

  const result = createUser(username, password, { createdIp: ip });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const res = NextResponse.json({ ok: true });
  const sid = startSession(res, username, req);
  if (!sid) return NextResponse.json({ error: 'No se pudo iniciar sesión' }, { status: 500 });
  logAuth('register', { user: username.trim().toLowerCase(), ip });
  return res;
}
