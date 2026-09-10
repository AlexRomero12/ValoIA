import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Firma y verificación de sesiones (HMAC-SHA256).
 *
 * Puro respecto a Next: lo usan tanto las rutas (Node) como `proxy.ts`
 * (runtime Node por defecto en Next 16). No importa `node:fs` para que el
 * proxy no arrastre el store de usuarios.
 *
 * Token: `base64url(payloadJson).base64url(hmac)`.
 * Secreto: `AUTH_SECRET`. Sin secreto en producción no hay sesiones válidas:
 * el login lo avisa con un error claro en vez de fallar en silencio.
 */

export interface SessionPayload {
  /** usuario */
  u: string;
  /** id de sesión en el registry (permite revocar) */
  sid: string;
  /** emitido (ms epoch) */
  iat: number;
  /** expira (ms epoch) */
  exp: number;
}

const DEV_SECRET = 'valoia-dev-insecure-secret';
export const SESSION_COOKIE = 'valoia_session';
export const SESSION_DAYS = 30;
export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;

/** Secreto efectivo; '' = login deshabilitado (falta AUTH_SECRET en prod). */
export function authSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === 'production') return '';
  return DEV_SECRET;
}

export function authConfigured(): boolean {
  return authSecret() !== '';
}

/** ¿Se está usando el secreto de desarrollo? (para avisar en logs) */
export function usingDevSecret(): boolean {
  const s = process.env.AUTH_SECRET;
  return !(s && s.length >= 16) && process.env.NODE_ENV !== 'production';
}

export function signSession(username: string, sid: string, now = Date.now()): string | null {
  const secret = authSecret();
  if (!secret) return null;
  const payload: SessionPayload = { u: username, sid, iat: now, exp: now + SESSION_MAX_AGE * 1000 };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySession(token: string | null | undefined, now = Date.now()): SessionPayload | null {
  if (!token) return null;
  const secret = authSecret();
  if (!secret) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', secret).update(body).digest();
  let given: Buffer;
  try {
    given = Buffer.from(sig, 'base64url');
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (!payload?.u || !payload.sid || typeof payload.exp !== 'number' || payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}
