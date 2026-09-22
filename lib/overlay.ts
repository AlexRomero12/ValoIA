import type { NextRequest } from 'next/server';
import { getPrimaryProfile, listProfiles, type ProfileViewer } from './profiles';
import { rateLimit } from './rateLimit';

/**
 * Helpers del overlay local (Overwolf, solo lectura).
 *
 * Riesgo aceptado del plan: cualquiera en el PC lee stats. No expone
 * keys, RSO, tienda ni mutaciones. Solo GET + `Cache-Control: no-store`.
 */

export const OVERLAY_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function overlayHeaders(): Record<string, string> {
  return { 'Cache-Control': 'no-store', ...OVERLAY_CORS_HEADERS };
}

export function overlayJson(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: overlayHeaders() });
}

export function overlayError(code: string, error: string, status: number): Response {
  return overlayJson({ error, code }, status);
}

export function overlayOptions(): Response {
  return new Response(null, { status: 204, headers: overlayHeaders() });
}

function isLoopbackIp(ip: string): boolean {
  const v = ip.trim().toLowerCase();
  if (!v || v === 'local') return true;
  if (v === '127.0.0.1' || v === '::1' || v === '::ffff:127.0.0.1') return true;
  if (v === 'localhost') return true;
  return false;
}

function isPrivateLanIp(ip: string): boolean {
  const v = ip.trim().toLowerCase().replace(/^::ffff:/, '');
  if (isLoopbackIp(v)) return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(v)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(v)) return true;
  const m = v.match(/^172\.(\d+)\.\d+\.\d+$/);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (v === '::1') return true;
  return false;
}

/**
 * IP aparente para rate-limit (best-effort en App Router: no hay socket IP).
 * Con TRUST_PROXY=1 usa X-Real-IP / última X-Forwarded-For; si no, 'local'.
 */
export function overlayIp(req: NextRequest): string {
  if (process.env.TRUST_PROXY === '1') {
    const real = req.headers.get('x-real-ip')?.trim();
    if (real) return real;
    const xff = req.headers.get('x-forwarded-for');
    if (xff) {
      const parts = xff.split(',').map((p) => p.trim()).filter(Boolean);
      if (parts.length > 0) return parts[parts.length - 1];
    }
  }
  return 'local';
}

/**
 * Gate loopback/LAN para el overlay.
 *
 * Nota Docker: Overwolf en el host hace fetch a localhost:4321 y el port
 * mapping entra al contenedor con IP de gateway (172.18.0.x), no 127.0.0.1.
 * Por eso se acepta loopback + LAN privada y se rechaza IP pública roteada
 * por proxy. Sin cabeceras de proxy se permite (tráfico directo local).
 */
export function overlayGate(
  req: NextRequest,
  opts: { allowPost?: boolean } = {},
): { ok: true; ip: string } | { ok: false; res: Response } {
  if (req.method === 'OPTIONS') return { ok: true, ip: overlayIp(req) };
  const allowed = opts.allowPost ? ['GET', 'POST'] : ['GET'];
  if (!allowed.includes(req.method)) {
    return { ok: false, res: overlayError('METHOD_NOT_ALLOWED', `Solo ${allowed.join('/')}`, 405) };
  }
  const ip = overlayIp(req);
  if (process.env.TRUST_PROXY === '1' && ip !== 'local' && !isPrivateLanIp(ip)) {
    return { ok: false, res: overlayError('FORBIDDEN', 'Solo loopback local', 403) };
  }
  const rl = rateLimit(`overlay:${ip}`, 60, 60_000);
  if (!rl.ok) {
    return {
      ok: false,
      res: Response.json({ error: 'Demasiadas peticiones', code: 'RATE_LIMITED' }, {
        status: 429,
        headers: {
          ...overlayHeaders(),
          ...(rl.retryAfterSec ? { 'Retry-After': String(rl.retryAfterSec) } : {}),
        },
      }),
    };
  }
  return { ok: true, ip };
}

/** Perfil del overlay: ?player=-id o el principal global (sin auth, solo lectura). */
export function resolveOverlayProfile(playerId?: string | null) {
  const profiles = listProfiles();
  if (playerId) {
    const found = profiles.find((p) => p.id === playerId);
    if (found) return found;
  }
  return getPrimaryProfile() ?? profiles.find((p) => p.visible) ?? profiles[0];
}

/** Viewer indefinido: getValSummary resuelve contra todos los perfiles (solo lectura). */
export function overlayViewer(): ProfileViewer | undefined {
  return undefined;
}

export function isoDayLocal(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
