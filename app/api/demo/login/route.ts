import { NextRequest, NextResponse } from 'next/server';
import { getUser, startSession } from '@/lib/auth';
import { isPublicMode } from '@/lib/appMode';
import { rateLimit } from '@/lib/rateLimit';
import { clientIp } from '@/lib/clientIp';
import { relativeRedirect } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * Acceso a la demo para la revisión de Riot: inicia sesión con la cuenta demo
 * (solo lectura) sin que el revisor tenga que crear una cuenta.
 * Se puede apagar con DEMO_LOGIN=0 y cambiar el usuario con DEMO_USER.
 */
export async function GET(req: NextRequest) {
  if (!isPublicMode() || process.env.DEMO_LOGIN === '0') {
    return NextResponse.json({ error: 'La demo está deshabilitada', code: 'DEMO_OFF' }, { status: 403 });
  }
  const demoUser = process.env.DEMO_USER ?? 'valoia-demo';
  const rl = rateLimit(`demo:${clientIp(req)}`, 20, 10 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ error: 'Demasiados accesos a la demo', code: 'RATE_LIMITED' }, { status: 429 });
  }
  if (!getUser(demoUser)) {
    return NextResponse.json({ error: 'La cuenta demo no existe', code: 'DEMO_MISSING' }, { status: 404 });
  }
  const res = relativeRedirect('/valorant');
  const sid = startSession(res, demoUser, req);
  if (!sid) {
    return NextResponse.json({ error: 'No se pudo iniciar la demo', code: 'DEMO_FAILED' }, { status: 500 });
  }
  return res;
}
