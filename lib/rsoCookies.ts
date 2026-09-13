/**
 * Utilidades puras para el jar de cookies de auth.riotgames.com (Cookie Reauth).
 *
 * Riot no expone la caducidad de la sesión: estas estimaciones salen de las
 * pruebas de la comunidad (techchrism/riot-auth-test):
 *  - solo `ssid`: ~1 semana
 *  - jar completo (tdid, asid, clid, ssid…): ~3 semanas
 */

export type CookieJar = Record<string, string>;

export const SESSION_DAYS_FULL = 21;
export const SESSION_DAYS_SSID_ONLY = 7;
/** Días antes de la estimación en que avisamos para reconectar. */
export const SESSION_WARN_DAYS = 4;

export interface ParsedCookies {
  jar: CookieJar;
  /** true si vino el jar de auth completo (más que la sola ssid). */
  full: boolean;
}

/**
 * Acepta el valor suelto de `ssid` o una cabecera cookie completa
 * (`a=b; c=d; …`, también con saltos de línea o prefijo `cookie:`).
 */
export function parseCookieInput(raw: string): ParsedCookies | { error: string } {
  const text = raw.trim();
  if (!text) return { error: 'Pega el valor de la cookie ssid o la cabecera cookie completa.' };

  const jar: CookieJar = {};
  const looksLikePair = text.includes('=') || text.includes(';') || text.includes('\n');
  if (!looksLikePair) {
    // Valor suelto de ssid (sin nombre).
    jar.ssid = text;
  } else {
    for (const part of text.split(/[;\n]+/)) {
      const eq = part.indexOf('=');
      if (eq <= 0) continue;
      const name = part.slice(0, eq).trim().replace(/^cookie:\s*/i, '');
      const value = part.slice(eq + 1).trim().replace(/^"|"$/g, '');
      if (name && value) jar[name] = value;
    }
  }

  if (!jar.ssid) {
    return {
      error: 'No encontré la cookie «ssid» en el texto. Copia la cabecera cookie completa o solo el valor de ssid.',
    };
  }
  return { jar, full: Object.keys(jar).length > 1 };
}

/** Estima la caducidad de la sesión y si ya toca avisar. */
export function sessionEstimate(
  connectedAt: number,
  full: boolean,
  now = Date.now(),
): { estimateExpiresAt: number; expiringSoon: boolean } {
  const days = full ? SESSION_DAYS_FULL : SESSION_DAYS_SSID_ONLY;
  const estimateExpiresAt = connectedAt + days * 86_400_000;
  const expiringSoon = now >= estimateExpiresAt - SESSION_WARN_DAYS * 86_400_000;
  return { estimateExpiresAt, expiringSoon };
}

/** Fusiona las cookies renovadas (`set-cookie`) en el jar existente. */
export function mergeCookies(jar: CookieJar, setCookies: string[]): CookieJar {
  const next: CookieJar = { ...jar };
  for (const raw of setCookies) {
    const pair = raw.split(';')[0] ?? '';
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (name && value) next[name] = value;
  }
  return next;
}

/** Cabecera `Cookie:` a partir del jar. */
export function cookieHeader(jar: CookieJar): string {
  return Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}
