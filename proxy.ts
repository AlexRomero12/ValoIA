import { NextResponse, type NextRequest } from 'next/server';
import { sessionGate } from './lib/auth';
import { SESSION_COOKIE } from './lib/authToken';

/**
 * Puerta de acceso (proxy de Next 16, ex-middleware).
 *
 * - Sin sesión válida: páginas → `/login?next=…`; API → 401.
 * - Sesión válida: la valida contra el registry (`sid`) para poder revocarla
 *   (cerrar dispositivos, cambio de contraseña, borrar usuario).
 * - `mustChangePassword`: solo deja cambiar la contraseña y salir.
 * - Mutaciones: exige `Origin` propio cuando el navegador lo envía (CSRF).
 */

// Permitidas mientras el usuario debe cambiar su contraseña.
const MUST_CHANGE_ALLOWED = new Set(['/api/auth/users', '/api/auth/session']);

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
  const isApi = pathname.startsWith('/api/');

  if (!sameOrigin(request)) {
    return Response.json({ error: 'Origen no permitido', code: 'BAD_ORIGIN' }, { status: 403 });
  }

  // Rutas de autenticación: no consultan el registry.
  if (pathname === '/api/auth/login' || pathname === '/api/auth/logout' || pathname === '/api/auth/request-access') {
    return NextResponse.next();
  }
  if (pathname === '/login') {
    // Solo redirige si la sesión sigue VIVA en el registry; si no, muestra el
    // login y limpia la cookie rancia (evita el bucle `/` ↔ `/login` cuando un
    // token tiene firma válida pero su sesión fue revocada).
    const gate = sessionGate(request);
    if (gate) {
      return NextResponse.redirect(new URL(gate.mustChange ? '/perfiles?cambiar=1' : '/', request.url));
    }
    const res = NextResponse.next();
    if (request.cookies.has(SESSION_COOKIE)) res.cookies.delete(SESSION_COOKIE);
    return res;
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
    // Limpia la cookie rancia para que el navegador no vuelva a rebotar.
    if (request.cookies.has(SESSION_COOKIE)) res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  if (gate.mustChange && pathname !== '/perfiles' && !MUST_CHANGE_ALLOWED.has(pathname)) {
    // Mientras debe cambiar la contraseña: APIs de lectura pasan (la página
    // /perfiles las necesita); el resto se bloquea/redirige.
    if (isApi && request.method !== 'GET') {
      return Response.json({ error: 'Debes cambiar tu contraseña', code: 'MUST_CHANGE_PASSWORD' }, { status: 403 });
    }
    if (!isApi) {
      return NextResponse.redirect(new URL('/perfiles?cambiar=1', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw\\.js).*)'],
};
