import type { NextRequest } from 'next/server';

/**
 * IP del cliente para rate-limit y registro de sesiones.
 *
 * Con `TRUST_PROXY=1` (detrás de Caddy) usa `X-Real-IP` —que el proxy fija
 * pisando lo que mande el cliente— o, en su defecto, la ÚLTIMA entrada de
 * `X-Forwarded-For` (la que añade el proxy, no la falsificable del cliente).
 * Sin proxy confiable devuelve 'local' (bucket compartido: los límites por IP
 * actúan como globales, nunca se confía en cabeceras del cliente).
 */
export function clientIp(req: NextRequest): string {
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
