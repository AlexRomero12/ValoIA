import { NextResponse, type NextRequest } from 'next/server';
import { sessionGate } from './lib/auth';
import { SESSION_COOKIE } from './lib/authToken';
import { isPublicMode } from './lib/appMode';

/**
 * Puerta de acceso (proxy de Next 16, ex-middleware).
 *
 * - Modo `single` (instancia personal): no hay login; solo se valida el
 *   `Origin` en mutaciones (CSRF).
 * - Modo `public` (producto para Riot): páginas sin sesión → `/login`;
 *   APIs sin sesión → 401. Rutas públicas: landing, legal, login/registro y el
 *   callback de vinculación con Riot.
 */

const PUBLIC_PATHS = new Set(['/', '/login', '/terms', '/privacy', '/riot.txt']);
const PUBLIC_APIS = new Set(['/api/auth/login', '/api/auth/register', '/api/riot/link/callback', '/api/demo/login']);
// Permitidas mientras el usuario debe cambiar su contraseña.
const MUST_CHANGE_ALLOWED = new Set(['/api/auth/users', '/api/auth/session', '/api/auth/logout']);
const MUST_CHANGE_PAGE = '/cuenta';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function sameOrigin(request: NextRequest): boolean {
  if (!MUTATING.has(request.method)) return true;
  const origin = request.headers.get('origin');
  // Peticiones sin Origin (curl/scripts) no son cross-site de navegador.
  if (!origin) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const host = request.headers.get('host') ?? request.nextUrl.host;
  if (originHost === host) return true;
  if (process.env.TRUST_PROXY === '1') {
    const fwd = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
    if (fwd && originHost === fwd) return true;
  }
  return false;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!sameOrigin(request)) {
    return Response.json({ error: 'Origen no permitido', code: 'BAD_ORIGIN' }, { status: 403 });
  }

  // Instancia personal: sin login.
  if (!isPublicMode()) return NextResponse.next();

  const isApi = pathname.startsWith('/api/');

  // Rutas públicas (landing, legal, login/registro, callback Riot).
  if (PUBLIC_PATHS.has(pathname) || PUBLIC_APIS.has(pathname)) {
    if (pathname === '/login') {
      const gate = sessionGate(request);
      if (gate) return NextResponse.redirect(new URL('/valorant', request.url));
      const res = NextResponse.next();
      if (request.cookies.has(SESSION_COOKIE)) res.cookies.delete(SESSION_COOKIE);
      return res;
    }
    return NextResponse.next();
  }

  const gate = sessionGate(request);

  if (!gate) {
    if (isApi) {
      return Response.json({ error: 'No autenticado', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    const login = new URL('/login', request.url);
    const next = `${pathname}${request.nextUrl.search}`;
    if (next && next !== '/') login.searchParams.set('next', next);
    const res = NextResponse.redirect(login);
    if (request.cookies.has(SESSION_COOKIE)) res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  if (gate.mustChange && pathname !== MUST_CHANGE_PAGE && !MUST_CHANGE_ALLOWED.has(pathname)) {
    if (isApi && request.method !== 'GET') {
      return Response.json({ error: 'Debes cambiar tu contraseña', code: 'MUST_CHANGE_PASSWORD' }, { status: 403 });
    }
    if (!isApi) {
      return NextResponse.redirect(new URL(`${MUST_CHANGE_PAGE}?cambiar=1`, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  // Públicos sin sesión: assets de Next, iconos PWA, imagen OG y manifest
  // (los crawlers de WhatsApp/Discord y el instalador deben leerlos directo).
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|icons/|og/|apple-touch-icon\\.png|manifest\\.webmanifest).*)',
  ],
};
