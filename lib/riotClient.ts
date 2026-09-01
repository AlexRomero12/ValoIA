import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { env } from './env';
import { cached, revalidate, invalidatePrefix } from './cache';
import { readData, writeData } from './persist';

/**
 * Tienda diaria de Valorant.
 *
 * HenrikDev eliminó la tienda individual de su API v4, así que este módulo
 * consulta directamente a Riot por dos vías:
 *
 *  1. LOCAL (preferida, $0 y sin credenciales): la API local del Riot Client
 *     (el launcher, que suele iniciar con Windows). El puerto y la contraseña
 *     salen del lockfile en `%LocalAppData%\Riot Games\Riot Client\Config`.
 *     Se lee con Basic auth `riot:{password}` y `/entitlements/v1/token`
 *     devuelve accessToken + entitlement + puuid listos para el storefront.
 *  2. RSO (respaldo): login remoto en auth.riotgames.com con las credenciales
 *     de la cuenta (VAL_RIOT_USER/PASS). Soporta 2FA (código ingresado desde
 *     la página). Los tokens duran ~24h y se guardan en data/rso.json.
 *
 * El storefront se consulta en pd.{shard}.a.pvp.net con los headers de
 * plataforma/versión del cliente.
 */

export type StoreSource = 'local' | 'rso' | 'none';

export interface StoreDailyItem {
  offerId: string;
  price: number;
}

export interface StoreBundleItem {
  itemId: string;
  /** Precio con descuento (si aplica) */
  price?: number;
  basePrice?: number;
}

export interface StoreBundle {
  id: string;
  name?: string;
  durationSec: number;
  totalBaseCost?: number;
  totalDiscountedCost?: number;
  discountPercent?: number;
  items: StoreBundleItem[];
}

export interface StoreFront {
  source: StoreSource;
  fetchedAt: number;
  daily: StoreDailyItem[];
  dailyRemainingSec: number;
  bundle: StoreBundle | null;
}

const STORE_TTL_MS = 60 * 60 * 1000;
const STORE_KEY = 'store:front';

const VP_CURRENCY = '85ad13f7-3d1b-5128-9eb2-7cd8b0e9c7c7';

const CLIENT_PLATFORM = Buffer.from(
  JSON.stringify({
    platformType: 'PC',
    platformOS: 'Windows',
    platformOSVersion: '10.0.19042.1.256.64bit',
    platformChipset: 'Unknown',
  }),
).toString('base64');

// ---------- Utilidades ----------

function shard(): string {
  return env('STORE_SHARD', 'na');
}

function localHost(): string {
  return env('STORE_LOCAL_HOST', '127.0.0.1');
}

/** ¿Estamos hablando con tools/riot-proxy.js (HTTP plano) en vez del Riot Client? */
function viaProxy(): boolean {
  const proxyPort = Number(env('RIOT_LOCAL_PORT'));
  return Number.isInteger(proxyPort) && proxyPort > 0;
}

// fetch a 127.0.0.1 con cert autofirmado del Riot Client: Node valida por
// defecto, así que usamos un agente https que no rechace el certificado.
const localAgent = new https.Agent({ rejectUnauthorized: false });

function firstCost(cost: Record<string, number> | undefined): number | undefined {
  if (!cost) return undefined;
  return cost[VP_CURRENCY] ?? Object.values(cost)[0];
}

// ---------- Versión del cliente (para los headers de pd) ----------

async function fetchClientVersion(): Promise<string> {
  return cached('valo:client-version', 24 * 60 * 60 * 1000, async () => {
    const res = await fetch('https://valorant-api.com/v1/version', {
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`version HTTP ${res.status}`);
    const json = (await res.json()) as { data?: { version?: string } };
    const v = json?.data?.version;
    if (!v) throw new Error('version vacía');
    return v;
  });
}

// ---------- Fuente local: API del Riot Client ----------

interface LocalTokens {
  accessToken: string;
  entitlement: string;
  subject: string;
  port: number;
}

function lockfilePath(): string | null {
  const custom = env('RIOT_LOCKFILE');
  if (custom) return custom;
  // El storefront exige tokens de la sesión del JUEGO (el Riot Client da 404).
  const local = process.env.LOCALAPPDATA;
  if (!local) return null;
  return path.join(local, 'Riot Games', 'Valorant', 'Config', 'lockfile');
}

function readLockfile(): { port: number; password: string } | null {
  const file = lockfilePath();
  if (!file) return null;
  try {
    const raw = fs.readFileSync(file, 'utf8').trim();
    const parts = raw.split(':');
    if (parts.length < 4) return null;
    const port = Number(parts[2]);
    if (!Number.isInteger(port) || port <= 0) return null;
    return { port, password: parts[3] };
  } catch {
    return null;
  }
}

/**
 * Puente al loopback del host (Docker + Riot Client): el Riot Client solo acepta
 * conexiones desde 127.0.0.1 del propio PC, así que tools/riot-proxy.js reenvía
 * en el host. Si RIOT_LOCAL_PORT está definido, se usa ese puerto (el del proxy)
 * en lugar del puerto del lockfile.
 */
function effectiveLocalPort(lock: { port: number; password: string }): number {
  const proxyPort = Number(env('RIOT_LOCAL_PORT'));
  return Number.isInteger(proxyPort) && proxyPort > 0 ? proxyPort : lock.port;
}

function basicAuthHeader(password: string): string {
  return `Basic ${Buffer.from(`riot:${password}`).toString('base64')}`;
}

async function localFetch(pathname: string, port: number, password: string): Promise<Record<string, unknown>> {
  const isProxy = viaProxy();
  // `agent` (cert autofirmado) es una opción de undici que no está en los tipos.
  // El Riot Client es HTTPS con cert autofirmado; el proxy de tools/ es HTTP plano.
  const res = await fetch(`${isProxy ? 'http' : 'https'}://${localHost()}:${port}${pathname}`, {
    headers: { Authorization: basicAuthHeader(password), Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
    ...(isProxy ? {} : { agent: localAgent }),
  } as unknown as RequestInit);
  if (!res.ok) throw new Error(`local API HTTP ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

/** Intenta obtener tokens del Riot Client local (null si no está disponible). */
export async function getLocalTokens(): Promise<LocalTokens | null> {
  const lock = readLockfile();
  if (!lock) return null;
  const port = effectiveLocalPort(lock);
  try {
    const json = await localFetch('/entitlements/v1/token', port, lock.password);
    const accessToken = typeof json.accessToken === 'string' ? json.accessToken : null;
    const entitlement = typeof json.token === 'string' ? json.token : null;
    const subject = typeof json.subject === 'string' ? json.subject : null;
    if (!accessToken || !entitlement || !subject) return null;
    return { accessToken, entitlement, subject, port };
  } catch {
    return null;
  }
}

// ---------- Fuente RSO (respaldo) ----------

interface RsoTokens {
  accessToken: string;
  entitlement: string;
  subject: string;
  expiresAt: number;
}

interface RsoState {
  tokens?: RsoTokens;
  /** cookie ssid de la sesión web (para Cookie Reauth sin contraseña) */
  ssid?: string;
  /** sesión 2FA pendiente: cookies del flujo para reanudar con el código */
  pending2fa?: { cookies: string; nonce: string };
}

const RSO_FILE = 'rso.json';

function readRsoState(): RsoState {
  return readData<RsoState>(RSO_FILE, {});
}

function setRsoState(state: RsoState): void {
  writeData(RSO_FILE, state);
}

const RSO_BASE = 'https://auth.riotgames.com';
const RSO_CLIENT_ID = 'play-valorant-web-prod';
const RSO_REDIRECT_URI = 'https://playvalorant.com/opt_in';
const RSO_SCOPE = 'account openid';

interface RsoAuthJson {
  uri?: string;
  type?: string;
  error?: string;
  multifactor?: unknown;
}

async function rsoFetch(
  method: 'POST' | 'PUT',
  pathname: string,
  cookies: string,
  body?: unknown,
): Promise<{ json: RsoAuthJson; cookies: string; status: number }> {
  const res = await fetch(`${RSO_BASE}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'RiotAuth/1.0.0 valo-ia',
      ...(cookies ? { Cookie: cookies } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
    signal: AbortSignal.timeout(25_000),
  });
  const setCookies = res.headers.getSetCookie?.() ?? [];
  const nextCookies = [...cookies.split(';').filter(Boolean), ...setCookies.map((c) => c.split(';')[0])].join('; ');
  const json = (await res.json().catch(() => ({}))) as RsoAuthJson;
  return { json, cookies: nextCookies, status: res.status };
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const part = token.split('.')[1];
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

function extractAccessToken(uri: string): string | null {
  const hash = uri.split('#')[1];
  if (!hash) return null;
  const m = hash.match(/(?:^|&)access_token=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function fetchEntitlements(accessToken: string): Promise<string> {
  const res = await fetch('https://entitlements.auth.riotgames.com/api/token/v1', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`entitlements HTTP ${res.status}`);
  const json = (await res.json()) as { entitlements_token?: string };
  if (!json.entitlements_token) throw new Error('entitlements vacío');
  return json.entitlements_token;
}

async function saveTokensFromUri(uri: string): Promise<void> {
  const accessToken = extractAccessToken(uri);
  if (!accessToken) throw new Error('No se obtuvo access_token del flujo RSO');
  const entitlement = await fetchEntitlements(accessToken);
  const subject = String(decodeJwtPayload(accessToken).sub ?? '');
  // Tokens de 1h (expires_in=3600 en la respuesta de Riot). Se conservan ssid
  // y pending2fa: saveTokensFromUri no debe borrar el estado existente.
  setRsoState({
    ...readRsoState(),
    tokens: { accessToken, entitlement, subject, expiresAt: Date.now() + 55 * 60 * 1000 },
  });
  // Tokens nuevos: el cache de tienda puede tener un 'none' previo a la conexión.
  invalidatePrefix(STORE_KEY);
}

export type RsoLoginResult =
  | { ok: true }
  | { ok: false; needs2fa: boolean; error?: string };

/** Inicia sesión RSO con user/pass (o las del .env). Devuelve si hace falta 2FA. */
export async function rsoLogin(usernameArg?: string, passwordArg?: string): Promise<RsoLoginResult> {
  const username = usernameArg ?? env('VAL_RIOT_USER');
  const password = passwordArg ?? env('VAL_RIOT_PASS');
  if (!username || !password) {
    return { ok: false, needs2fa: false, error: 'Faltan VAL_RIOT_USER/VAL_RIOT_PASS en .env' };
  }

  const first = await rsoFetch('POST', '/api/v1/authorization', '', {
    client_id: RSO_CLIENT_ID,
    nonce: '1',
    redirect_uri: RSO_REDIRECT_URI,
    response_type: 'token id_token',
    scope: RSO_SCOPE,
  });

  const second = await rsoFetch('PUT', '/api/v1/authorization', first.cookies, {
    type: 'auth',
    username,
    password,
    remember: true,
    language: 'en_US',
  });

  if (second.status === 200 && second.json?.uri) {
    try {
      await saveTokensFromUri(second.json.uri);
      return { ok: true };
    } catch (e) {
      return { ok: false, needs2fa: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  if (second.status === 403 && second.json?.type === 'multifactor') {
    setRsoState({ pending2fa: { cookies: second.cookies, nonce: '1' } });
    return { ok: false, needs2fa: true };
  }

  if (second.json?.type === 'captcha') {
    return {
      ok: false,
      needs2fa: false,
      error: 'Riot exige un captcha para este login: verifica las credenciales e inténtalo de nuevo en unos minutos.',
    };
  }

  if (second.status === 400 && second.json?.error === 'auth_failure') {
    return {
      ok: false,
      needs2fa: false,
      error:
        'Riot ya no acepta login programático con usuario/contraseña (exige hCaptcha de la página web). Conecta el respaldo con la cookie ssid: entra a auth.riotgames.com en tu navegador, copia la cookie «ssid» (F12 → Application → Cookies) y pégala en la página Tienda.',
    };
  }

  if (second.status === 429) {
    return { ok: false, needs2fa: false, error: 'Rate limited por Riot, espera un minuto' };
  }

  return { ok: false, needs2fa: false, error: `RSO falló (HTTP ${second.status}): ${JSON.stringify(second.json).slice(0, 200)}` };
}

/** Envía el código 2FA de la sesión pendiente y guarda los tokens. */
export async function rsoSubmit2fa(code: string): Promise<{ ok: boolean; error?: string }> {
  const state = readRsoState();
  if (!state.pending2fa) return { ok: false, error: 'No hay sesión 2FA pendiente (inicia login primero)' };

  const res = await rsoFetch('PUT', '/api/v1/authorization', state.pending2fa.cookies, {
    type: 'multifactor',
    code: String(code).trim(),
    rememberDevice: false,
  });

  if (res.status === 200 && res.json?.uri) {
    try {
      await saveTokensFromUri(res.json.uri);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  if (res.status === 400) return { ok: false, error: 'Código incorrecto' };
  return { ok: false, error: `2FA falló (HTTP ${res.status})` };
}

/** Estado de la vía RSO: ok | needs_2fa | needs_cookie */
export async function rsoStatus(): Promise<'ok' | 'needs_2fa' | 'needs_cookie'> {
  const state = readRsoState();
  if (state.tokens && state.tokens.expiresAt > Date.now()) return 'ok';
  if (state.pending2fa) return 'needs_2fa';
  if (state.ssid) {
    // Revalidación silenciosa con la cookie guardada.
    const r = await rsoCookieReauth(state.ssid);
    if (r.ok) return 'ok';
  }
  return 'needs_cookie';
}

/**
 * Cookie Reauth: renueva tokens con la cookie ssid de una sesión web
 * (auth.riotgames.com). Riot ya exige hCaptcha en el login por contraseña,
 * así que esta es la vía documentada para entrar sin el juego abierto.
 * Éxito = 301 hacia playvalorant.com/opt_in#access_token=...; fallo = 301
 * hacia authenticate.riotgames.com/login.
 */
async function rsoCookieReauth(ssid: string): Promise<{ ok: boolean; newCookies?: string[]; error?: string }> {
  const url = `https://auth.riotgames.com/authorize?redirect_uri=${encodeURIComponent(RSO_REDIRECT_URI)}&client_id=${RSO_CLIENT_ID}&response_type=${encodeURIComponent('token id_token')}&nonce=1&scope=${encodeURIComponent(RSO_SCOPE)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Cookie: `ssid=${ssid}`, 'User-Agent': 'RiotAuth/1.0.0 valo-ia' },
      redirect: 'manual',
      signal: AbortSignal.timeout(25_000),
    });
  } catch (e) {
    return { ok: false, error: `Sin conexión con auth.riotgames.com: ${e instanceof Error ? e.message : String(e)}` };
  }
  const location = res.headers.get('location') ?? '';
  const newCookies = res.headers.getSetCookie?.().map((c) => c.split(';')[0]) ?? [];

  if (/authenticate\.riotgames\.com\/login/.test(location)) {
    return { ok: false, error: 'La sesión (ssid) ya no es válida: entra a auth.riotgames.com en tu navegador y copia la cookie de nuevo.' };
  }
  if (!location) {
    return { ok: false, error: `Reauth sin redirección (HTTP ${res.status})` };
  }
  try {
    await saveTokensFromUri(location);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  return { ok: true, newCookies };
}

/** Conecta el respaldo con la cookie ssid del navegador (la valida y guarda). */
export async function rsoConnectCookie(ssidRaw: string): Promise<{ ok: boolean; error?: string }> {
  const ssid = ssidRaw.trim().replace(/^ssid=/i, '');
  if (!ssid) return { ok: false, error: 'Falta la cookie ssid' };
  const r = await rsoCookieReauth(ssid);
  if (!r.ok) return r;
  const state = readRsoState();
  // Riot puede renovar la ssid en la respuesta: guardamos la más reciente.
  const renewed = r.newCookies?.find((c) => c.startsWith('ssid='))?.slice(5);
  state.ssid = renewed ?? ssid;
  setRsoState(state);
  return { ok: true };
}

async function rsoTokensFresh(): Promise<RsoTokens | null> {
  const state = readRsoState();
  if (state.tokens && state.tokens.expiresAt > Date.now()) return state.tokens;

  // Renovación silenciosa con la cookie ssid guardada (el cron la mantiene viva).
  if (state.ssid) {
    const r = await rsoCookieReauth(state.ssid);
    if (r.ok) {
      const next = readRsoState().tokens ?? null;
      if (next) return next;
    }
  }
  return null;
}

// ---------- Storefront ----------

interface StorefrontOffer {
  OfferID?: string;
  Cost?: Record<string, number>;
}

interface StorefrontPayload {
  SkinsPanelLayout?: {
    SingleItemStoreOffers?: StorefrontOffer[];
    SingleItemOffersRemainingDurationInSeconds?: number;
  };
  FeaturedBundle?: {
    Bundle?: {
      ID?: string;
      Items?: {
        Item?: { ItemTypeID?: string; ItemID?: string };
        BasePrice?: number;
        DiscountedPrice?: number;
        DiscountPercent?: number;
      }[];
      TotalBaseCost?: Record<string, number>;
      TotalDiscountedCost?: Record<string, number>;
      TotalDiscountPercent?: number;
      DurationRemainingInSeconds?: number;
    };
    Bundles?: Array<{
      ID?: string;
      Items?: {
        Item?: { ItemTypeID?: string; ItemID?: string };
        BasePrice?: number;
        DiscountedPrice?: number;
        DiscountPercent?: number;
      }[];
      TotalBaseCost?: Record<string, number>;
      TotalDiscountedCost?: Record<string, number>;
      TotalDiscountPercent?: number;
      DurationRemainingInSeconds?: number;
    }>;
    BundleRemainingDurationInSeconds?: number;
  };
}

function parseStorefront(json: StorefrontPayload): StoreFront {
  const layout = json.SkinsPanelLayout;
  const daily: StoreDailyItem[] = (layout?.SingleItemStoreOffers ?? [])
    .filter((o) => o.OfferID && o.Cost)
    .map((o) => ({ offerId: o.OfferID!, price: firstCost(o.Cost) ?? 0 }));

  const bundles = json.FeaturedBundle?.Bundles ?? [];
  const b = bundles[0] ?? json.FeaturedBundle?.Bundle;
  const bundle: StoreBundle | null = b
    ? {
        id: b.ID ?? '',
        durationSec: json.FeaturedBundle?.BundleRemainingDurationInSeconds ?? b.DurationRemainingInSeconds ?? 0,
        totalBaseCost: firstCost(b.TotalBaseCost),
        totalDiscountedCost: firstCost(b.TotalDiscountedCost),
        discountPercent: b.TotalDiscountPercent,
        items: (b.Items ?? [])
          .filter((it) => it.Item?.ItemID)
          .map((it) => ({
            itemId: it.Item!.ItemID!,
            price: it.DiscountedPrice ?? it.BasePrice,
            basePrice: it.BasePrice,
          })),
      }
    : null;

  return {
    source: 'none',
    fetchedAt: Date.now(),
    daily,
    dailyRemainingSec: layout?.SingleItemOffersRemainingDurationInSeconds ?? 0,
    bundle,
  };
}

async function fetchStorefront(
  tokens: { accessToken: string; entitlement: string; subject: string },
): Promise<StoreFront> {
  const version = await fetchClientVersion();
  // Riot migró el storefront a V3 (POST con body vacío); el v2 GET responde 404.
  const res = await fetch(`https://pd.${shard()}.a.pvp.net/store/v3/storefront/${tokens.subject}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      'X-Riot-Entitlements-JWT': tokens.entitlement,
      'X-Riot-ClientPlatform': CLIENT_PLATFORM,
      'X-Riot-ClientVersion': version,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: '{}',
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`storefront HTTP ${res.status}: ${body.slice(0, 160)}`);
  }
  const json = (await res.json()) as StorefrontPayload;
  return parseStorefront(json);
}

/**
 * Storefront fresco (sin caché): local primero, RSO como respaldo.
 * Si ninguna vía está disponible devuelve { source: 'none', ... }.
 */
export async function fetchStoreFrontFresh(): Promise<StoreFront> {
  const local = await getLocalTokens();
  if (local) {
    try {
      const front = await fetchStorefront(local);
      front.source = 'local';
      return front;
    } catch (e) {
      console.error(`[store] storefront local falló: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const rsoTokens = await rsoTokensFresh();
  if (rsoTokens) {
    try {
      const front = await fetchStorefront(rsoTokens);
      front.source = 'rso';
      return front;
    } catch (e) {
      console.error(`[store] storefront RSO falló: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { source: 'none', fetchedAt: Date.now(), daily: [], dailyRemainingSec: 0, bundle: null };
}

/** Storefront con caché de 1h (para la página). */
export async function getStoreFront(): Promise<StoreFront> {
  try {
    return await cached(STORE_KEY, STORE_TTL_MS, fetchStoreFrontFresh);
  } catch {
    // Si el loader falla (p. ej. rate limit), servimos lo último conocido.
    return fetchStoreFrontFresh();
  }
}

/** Recarga forzada (para el cron de notificaciones). */
export async function refreshStoreFront(): Promise<StoreFront> {
  try {
    return await revalidate(STORE_KEY, STORE_TTL_MS, fetchStoreFrontFresh);
  } catch {
    return fetchStoreFrontFresh();
  }
}