import { env } from '../env';

/**
 * Cliente HTTP de la API oficial de Riot (single-account, rama dev).
 *
 * - `RIOT_API_KEY`: dev key (24 h) hoy; production key en el futuro.
 * - `RIOT_MATCH_SOURCE=mock|live`: los endpoints de partidas (VAL-MATCH-V1)
 *   responden 403 con dev key; `mock` sirve fixtures con el mismo DTO que
 *   producción y `live` usa la API real (se activa al tener la key productiva).
 * - Rate limit dirigido por headers (`X-RateLimit-*`, `Retry-After`).
 */

export const RIOT_CONFIG = {
  apiKey: () => env('RIOT_API_KEY'),
  name: () => env('VAL_NAME', 'Player'),
  tag: () => env('VAL_TAG', '0000'),
  cluster: () => env('VAL_CLUSTER', 'americas'),
  shard: () => env('VAL_SHARD', 'latam'),
  matchSource: (): 'mock' | 'live' => (env('RIOT_MATCH_SOURCE', 'mock').toLowerCase() === 'live' ? 'live' : 'mock'),
};

export class RiotApiError extends Error {
  code: 'KEY_MISSING' | 'KEY_EXPIRED' | 'RATE_LIMITED' | 'FORBIDDEN' | 'HTTP' | 'NETWORK' | 'NOT_FOUND';
  status?: number;
  constructor(code: RiotApiError['code'], message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// Rate limit basado en los headers de Riot. La ventana corta (X-Rate-Limit) se
// respeta con esperas; la ventana larga de arranque (500/10s) es holgada para
// una sola cuenta, pero los headers mandan cuando llegue la key productiva.
const shortWindow: { limit: number; count: number; resetAt: number } = { limit: 0, count: 0, resetAt: 0 };

function updateLimits(res: Response): void {
  const raw = res.headers.get('x-rate-limit');
  if (!raw) return;
  // Formato: "20:1,100:120" (count:seconds)
  const first = raw.split(',')[0]?.trim();
  const [limitRaw, windowRaw] = first.split(':');
  const limit = Number(limitRaw);
  const windowSec = Number(windowRaw);
  if (!Number.isFinite(limit) || !Number.isFinite(windowSec)) return;
  const now = Date.now();
  if (now >= shortWindow.resetAt || shortWindow.limit !== limit) {
    shortWindow.limit = limit;
    shortWindow.count = 0;
    shortWindow.resetAt = now + windowSec * 1000;
  }
}

async function respectLimits(): Promise<void> {
  if (shortWindow.limit <= 0) return;
  if (Date.now() >= shortWindow.resetAt) {
    shortWindow.count = 0;
    shortWindow.resetAt = 0;
    return;
  }
  // Se deja 1 de margen para no rozar el 429.
  if (shortWindow.count >= shortWindow.limit - 1) {
    const waitMs = shortWindow.resetAt - Date.now() + 100;
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
    shortWindow.count = 0;
    shortWindow.resetAt = 0;
  }
}

/** GET autenticado contra un host de Riot (cuenta/contenido/partidas). */
export async function riotFetch<T>(url: string, opts: { allow403?: boolean } = {}): Promise<T> {
  const key = RIOT_CONFIG.apiKey();
  if (!key) {
    throw new RiotApiError('KEY_MISSING', 'Falta RIOT_API_KEY. Genera una dev key en https://developer.riotgames.com');
  }

  await respectLimits();

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'X-Riot-Token': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    throw new RiotApiError('NETWORK', `Sin conexión con la API de Riot: ${e instanceof Error ? e.message : e}`);
  }

  updateLimits(res);

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after'));
    if (Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter <= 10) {
      await new Promise((r) => setTimeout(r, retryAfter * 1000 + 250));
      return riotFetch(url, opts);
    }
    throw new RiotApiError('RATE_LIMITED', 'Rate limit de la API de Riot alcanzado, reintenta en un momento', 429);
  }
  if (res.status === 403) {
    const msg =
      opts.allow403 && RIOT_CONFIG.matchSource() === 'mock'
        ? 'VAL-MATCH-V1 requiere key de producción y RIOT_MATCH_SOURCE=mock no debería llegar aquí'
        : 'RIOT_API_KEY inválida, expirada (las dev keys duran 24 h) o sin acceso al endpoint. En dev, VAL-MATCH-V1 solo funciona en modo mock (RIOT_MATCH_SOURCE=mock)';
    throw new RiotApiError('FORBIDDEN', msg, 403);
  }
  if (res.status === 404) {
    throw new RiotApiError('NOT_FOUND', 'Recurso no encontrado en la API de Riot', 404);
  }
  if (!res.ok) {
    throw new RiotApiError('HTTP', `API de Riot HTTP ${res.status}`, res.status);
  }
  return res.json() as Promise<T>;
}

/** Host de cuenta (americas/europe/asia). */
export function accountHost(): string {
  return `https://${RIOT_CONFIG.cluster()}.api.riotgames.com`;
}

/** Host de plataforma para VAL-MATCH-V1/VAL-CONTENT (na/latam/br/eu/ap/kr). */
export function platformHost(): string {
  return `https://${RIOT_CONFIG.shard()}.api.riotgames.com`;
}
