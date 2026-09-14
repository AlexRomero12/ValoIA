import { NextResponse } from 'next/server';

/**
 * Redirect con `Location` relativo.
 *
 * Dentro del contenedor `req.url` es `http://0.0.0.0:3000/...` (HOSTNAME/PORT
 * del Dockerfile), así que construir la URL absoluta con la request rompe
 * detrás de Caddy (el navegador iba a `https://0.0.0.0:3000/...`). El navegador
 * resuelve un Location relativo contra el origen público sin problemas.
 */
export function relativeRedirect(location: string, status: 302 | 303 | 307 = 303): NextResponse {
  return new NextResponse(null, { status, headers: { Location: location } });
}
