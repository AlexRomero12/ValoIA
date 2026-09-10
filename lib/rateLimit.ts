/**
 * Rate-limit en memoria (ventana fija) para login, solicitudes y refresh.
 *
 * - Limpieza periódica + tope de claves (evita crecimiento por DoS de memoria).
 * - Devuelve `retryAfterSec` para responder 429 con `Retry-After`.
 * - Es por proceso: alcanza para una instancia (nuestro caso).
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 10_000;
let lastPrune = 0;

function prune(now: number): void {
  if (now - lastPrune < 60_000) return;
  lastPrune = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
  // Si aún desborda, tira las más viejas por reset.
  if (buckets.size > MAX_KEYS) {
    const excess = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt).slice(0, buckets.size - MAX_KEYS);
    for (const [key] of excess) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  /** segundos hasta poder reintentar (solo si ok=false) */
  retryAfterSec?: number;
  /** intentos restantes en la ventana */
  remaining: number;
}

export function rateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  prune(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: max - 1 };
  }
  bucket.count += 1;
  if (bucket.count > max) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)), remaining: 0 };
  }
  return { ok: true, remaining: Math.max(0, max - bucket.count) };
}

/** Limpia el contador (p. ej. login exitoso). */
export function clearRateLimit(key: string): void {
  buckets.delete(key);
}
