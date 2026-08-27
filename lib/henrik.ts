import { env } from './env';
import { cached, peek } from './cache';

const BASE = 'https://api.henrikdev.xyz';

export const HENRIK_CONFIG = {
  apiKey: () => env('HENRIK_API_KEY'),
  name: () => env('VAL_NAME', 'AlexRomero12'),
  tag: () => env('VAL_TAG', 'LAN'),
  region: () => env('VAL_REGION', 'na'),
  platform: () => env('VAL_PLATFORM', 'pc'),
};

export class HenrikError extends Error {
  code: 'KEY_MISSING' | 'KEY_INVALID' | 'RATE_LIMITED' | 'NOT_FOUND' | 'HTTP';
  status?: number;
  constructor(code: HenrikError['code'], message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// Throttle: la key Basic permite 30 req/min — operamos con margen.
const MINUTE_MS = 60_000;
const MAX_REQ_PER_MINUTE = 24;
const MIN_GAP_MS = 1_800;
const requestTimes: number[] = [];

async function throttle(): Promise<void> {
  const now = Date.now();
  while (requestTimes.length > 0 && now - requestTimes[0] > MINUTE_MS) {
    requestTimes.shift();
  }
  if (requestTimes.length >= MAX_REQ_PER_MINUTE) {
    const waitMs = MINUTE_MS - (now - requestTimes[0]) + 300;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  // Sin ráfagas: espaciado mínimo entre requests (el limiter de Henrik también
  // penaliza bursts cortos, p. ej. 4 requests seguidos en ~5 s ya dió 429).
  const last = requestTimes[requestTimes.length - 1];
  if (last != null) {
    const elapsed = Date.now() - last;
    if (elapsed < MIN_GAP_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_GAP_MS - elapsed + 150));
    }
  }
  requestTimes.push(Date.now());
}

async function rawFetch(path: string, authHeader: Record<string, string>): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json', ...authHeader },
    signal: AbortSignal.timeout(25_000),
  });
}

async function henrikFetch(path: string): Promise<any> {
  const key = HENRIK_CONFIG.apiKey();
  if (!key) {
    throw new HenrikError(
      'KEY_MISSING',
      'Falta HENRIK_API_KEY. Genera una gratis en https://api.henrikdev.xyz/dashboard/ (requiere entrar al Discord de Henrik-3)',
    );
  }

  await throttle();

  let res: Response;
  try {
    // La API acepta Authorization directo (sin "Bearer"); reintentamos con Bearer por si cambia.
    res = await rawFetch(path, { Authorization: key });
    if (res.status === 401 || res.status === 403) {
      res = await rawFetch(path, { Authorization: `Bearer ${key}` });
    }
  } catch (e) {
    throw new HenrikError('HTTP', `Sin conexión con api.henrikdev.xyz: ${e instanceof Error ? e.message : e}`);
  }

  if (res.status === 401 || res.status === 403) {
    throw new HenrikError(
      'KEY_INVALID',
      `HENRIK_API_KEY inválida o sin permisos (HTTP ${res.status}). Revisa/regenera tu key en https://api.henrikdev.xyz/dashboard/`,
      res.status,
    );
  }
  if (res.status === 429) {
    // Un reintento tardío antes de rendirse (el throttle ya minimiza esto).
    await new Promise((resolve) => setTimeout(resolve, 15_000));
    res = await rawFetch(path, { Authorization: key });
    if (res.status === 429) {
      throw new HenrikError('RATE_LIMITED', 'Rate limit de api.henrikdev.xyz alcanzado, reintenta en un minuto', 429);
    }
  }
  if (res.status === 404) {
    throw new HenrikError(
      'NOT_FOUND',
      'No encontrado en api.henrikdev.xyz (¿nombre/tag correctos? ¿región VAL_REGION=na?)',
      404,
    );
  }
  if (!res.ok) {
    throw new HenrikError('HTTP', `henrikdev HTTP ${res.status}`, res.status);
  }
  return res.json();
}

export interface HenrikAccount {
  puuid: string;
  name: string;
  tag: string;
  region?: string;
  account_level?: number;
  card?: { small?: string; large?: string };
  last_update?: string;
}

/** Key de caché de la cuenta (compartida con getHenrikAccount). */
export function henrikAccountKey(nameArg: string, tagArg: string): string {
  return `henrik:account:${encodeURIComponent(nameArg)}:${encodeURIComponent(tagArg)}`;
}

/** Solo fetch bruto (sin caché), para revalidaciones del bucket/refresh. */
export async function fetchHenrikAccountRaw(nameArg: string, tagArg: string): Promise<{ puuid?: string; name?: string; tag?: string; region?: string; account_level?: number; card?: { small?: string; large?: string }; last_update?: string }> {
  const name = encodeURIComponent(nameArg);
  const tag = encodeURIComponent(tagArg);
  const json = await henrikFetch(`/valorant/v2/account/${name}/${tag}`);
  return json?.data;
}

export async function getHenrikAccount(
  nameArg = HENRIK_CONFIG.name(),
  tagArg = HENRIK_CONFIG.tag(),
): Promise<HenrikAccount> {
  const data = await cached(henrikAccountKey(nameArg, tagArg), 60 * 60 * 1000, () => fetchHenrikAccountRaw(nameArg, tagArg));
  if (!data?.puuid) throw new HenrikError('NOT_FOUND', `Cuenta ${nameArg}#${tagArg} no encontrada`);
  return {
    puuid: data.puuid,
    name: data.name ?? nameArg,
    tag: data.tag ?? tagArg,
    region: data.region,
    account_level: data.account_level,
    card: data.card,
    last_update: data.last_update,
  };
}

// ---------- Schema v4 real (según openapi del server 4.6.0) ----------

export interface HenrikMatchPlayerStats {
  score?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  headshots?: number;
  bodyshots?: number;
  legshots?: number;
  damage?: { dealt?: number; received?: number };
}

export interface HenrikMatchPlayer {
  puuid?: string;
  name?: string;
  tag?: string;
  team_id?: string;
  agent?: { id?: string; name?: string };
  tier?: { id?: number; name?: string };
  stats?: HenrikMatchPlayerStats;
  economy?: {
    spent?: { overall?: number; average?: number };
    loadout_value?: { overall?: number; average?: number };
  };
  behavior?: { afk_rounds?: number };
}

export interface HenrikMatchTeam {
  team_id?: string | null;
  rounds?: { won?: number; lost?: number };
  won?: boolean | null;
}

export interface HenrikKill {
  killer?: { puuid?: string; name?: string; team?: string };
  victim?: { puuid?: string; name?: string; team?: string };
  assistants?: { name?: string; puuid?: string }[];
  weapon?: { id?: string | null; name?: string | null; type?: string | null };
  round?: number;
}

export interface HenrikMatchRound {
  id?: number;
  result?: string;
  winning_team?: string | null;
  plant?: { site?: string; player?: { name?: string; puuid?: string } } | null;
  defuse?: { player?: { name?: string; puuid?: string } } | null;
}

export interface HenrikMatch {
  metadata: {
    match_id?: string;
    map?: { id?: string; name?: string };
    started_at?: string;
    game_length_in_ms?: number;
    is_completed?: boolean;
    queue?: { id?: string; mode_type?: string | null; name?: string | null };
    season?: { id?: string; short?: string };
    platform?: string;
    region?: string | null;
    cluster?: string | null;
  };
  players?: HenrikMatchPlayer[];
  teams?: HenrikMatchTeam[];
  kills?: HenrikKill[];
  rounds?: HenrikMatchRound[];
}

export function henrikMatchTimestamp(m: HenrikMatch): number {
  const iso = m.metadata?.started_at;
  if (iso) {
    const t = Date.parse(iso);
    if (Number.isFinite(t)) return t;
  }
  return 0;
}

export function henrikRoundsPlayed(m: HenrikMatch): number {
  const teams = m.teams ?? [];
  // Ambos equipos juegan las mismas rondas: usamos el máximo de un equipo,
  // no la suma de ambos (que duplicaría el total).
  let maxTeam = 0;
  for (const t of teams) {
    maxTeam = Math.max(maxTeam, (t.rounds?.won ?? 0) + (t.rounds?.lost ?? 0));
  }
  return Math.max(1, maxTeam);
}


export interface HenrikMmrHistoryEntry {
  match_id?: string;
  tier?: { id?: number; name?: string };
  map?: { id?: string; name?: string };
  season?: { id?: string; short?: string };
  rr?: number;
  last_change?: number;
  elo?: number;
  refunded_rr?: number;
  was_derank_protected?: boolean;
  date?: string;
}

/** Key de caché del historial MMR (compartida con getHenrikMmrHistory). */
export function henrikMmrKey(nameArg: string, tagArg: string): string {
  return `henrik:mmr-history:${encodeURIComponent(nameArg)}:${encodeURIComponent(tagArg)}`;
}

/** Solo fetch bruto (sin caché), para revalidaciones del bucket/refresh. */
export async function fetchHenrikMmrHistoryRaw(nameArg: string, tagArg: string): Promise<HenrikMmrHistoryEntry[]> {
  const name = encodeURIComponent(nameArg);
  const tag = encodeURIComponent(tagArg);
  const affinity = HENRIK_CONFIG.region();
  const platform = HENRIK_CONFIG.platform();
  const json = await henrikFetch(`/valorant/v2/mmr-history/${affinity}/${platform}/${name}/${tag}`);
  return json?.data?.history ?? [];
}

export async function getHenrikMmrHistory(
  nameArg = HENRIK_CONFIG.name(),
  tagArg = HENRIK_CONFIG.tag(),
): Promise<HenrikMmrHistoryEntry[]> {
  return cached(henrikMmrKey(nameArg, tagArg), 10 * 60 * 1000, () => fetchHenrikMmrHistoryRaw(nameArg, tagArg));
}

// ---------- Bucket de partidas por jugador (sync incremental) ----------

/**
 * Un bucket por jugador guarda las partidas competitivas descargadas.
 * El sync es incremental: se pide la página más reciente y, si no hay partidas
 * nuevas o el cache ya cubre el objetivo (`want`), no se piden más páginas.
 *
 * Clave de caché: henrik:matches:v2:{name}:{tag} -> MatchesBucket (persistente en disco)
 */

export const BUCKET_LIMIT = 40;
export const BUCKET_TTL_MS = 15 * 60 * 1000;
const BUCKET_PREFIX = 'henrik:matches:v2';

export interface MatchesBucket {
  /** ms epoch de la última sincronización exitosa */
  updatedAt: number;
  /** hasta BUCKET_LIMIT partidas competitivas, más recientes primero */
  matches: HenrikMatch[];
}

function bucketKey(nameEncoded: string, tagEncoded: string): string {
  return `${BUCKET_PREFIX}:${nameEncoded}:${tagEncoded}`;
}

function matchId(m: HenrikMatch): string {
  return m.metadata?.match_id ?? '';
}

async function fetchMatchesPage(
  affinity: string,
  platform: string,
  name: string,
  tag: string,
  mode: string,
  start: number,
  size: number,
): Promise<HenrikMatch[]> {
  const qs = new URLSearchParams({ mode, size: String(size), start: String(start) });
  const json = (await henrikFetch(
    `/valorant/v4/matches/${affinity}/${platform}/${name}/${tag}?${qs}`,
  )) as { status?: number; data?: HenrikMatch[] };
  return json?.data ?? [];
}

const PAGE_SIZE = 10;

/**
 * Descarga y mergea páginas nuevas en el bucket (sin pasar por cached():
 * la decisión de "cuánto profundizar" la toman getMatchesBucket/revalidate).
 * Reutiliza el contenido previo (aunque esté stale) como base para el diff.
 *
 * Coste típico por ciclo:
 *  - Sin novedades y ya cubría el objetivo -> 1 request (página 0, frescura).
 *  - Con novedades -> página 0 (+ páginas siguientes solo si hace falta profundizar).
 */
export async function syncMatchesBucket(
  nameArg: string,
  tagArg: string,
  want: number,
  mode = 'competitive',
): Promise<MatchesBucket> {
  const name = encodeURIComponent(nameArg);
  const tag = encodeURIComponent(tagArg);
  const key = bucketKey(name, tag);
  const affinity = HENRIK_CONFIG.region();
  const platform = HENRIK_CONFIG.platform();
  const target = Math.max(1, Math.min(want, BUCKET_LIMIT));

  const base = peek<MatchesBucket>(key);
  const allOld: HenrikMatch[] = base?.matches ?? [];
  const baseLen = allOld.length;
  // Partidas nuevas: `fresh` = página 0 (las más recientes) y
  // `deep` = páginas profundas (más antiguas que `.matches` del bucket).
  const fresh: HenrikMatch[] = [];
  const deep: HenrikMatch[] = [];
  const seen = new Set<string>();
  for (const m of allOld) {
    const id = matchId(m);
    if (id) seen.add(id);
  }

  const pagesNeeded = Math.ceil(target / PAGE_SIZE);
  for (let p = 0; p < pagesNeeded; p++) {
    const start = p * PAGE_SIZE;
    const size = Math.min(PAGE_SIZE, target - start);
    if (size <= 0) break;

    // Páginas ya cubiertas por el bucket previo: se saltan (la página 0 se
    // descarga siempre para detectar partidas nuevas).
    if (p !== 0 && start + size <= baseLen) continue;

    let batch: HenrikMatch[];
    try {
      batch = await fetchMatchesPage(affinity, platform, name, tag, mode, start, size);
    } catch (err) {
      // Con datos en mano, preferimos devolverlos antes que fallar todo.
      if (err instanceof HenrikError && err.code === 'RATE_LIMITED' && (fresh.length + deep.length) > 0) break;
      throw err;
    }
    if (!batch.length) break;

    for (const m of batch) {
      const id = matchId(m);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      (p === 0 ? fresh : deep).push(m);
    }
    // La API devolvió menos de lo pedido => no hay más historial.
    if (batch.length < size) break;
  }

  // Orden final (más reciente primero): nuevas frescas de la página 0 +
  // bucket previo (ya ordenado) + nuevas profundas (más antiguas que el bucket).
  const freshIds = new Set(fresh.map(matchId));
  const baseDeduped = allOld.filter((m) => !freshIds.has(matchId(m)));
  const all = [...fresh, ...baseDeduped, ...deep].slice(0, BUCKET_LIMIT);

  return { updatedAt: Date.now(), matches: all };
}

/**
 * Bucket de partidas competitivas de un jugador.
 * - Sirve del caché mientras esté fresco (15 min).
 * - Si el caché no cubre el `want` actual, lo amplía incrementalmente.
 */
export async function getMatchesBucket(nameArg: string, tagArg: string, want: number): Promise<MatchesBucket> {
  const name = encodeURIComponent(nameArg);
  const tag = encodeURIComponent(tagArg);
  const key = bucketKey(name, tag);
  return cached(
    key,
    BUCKET_TTL_MS,
    () => syncMatchesBucket(nameArg, tagArg, want),
    (v) => Array.isArray((v as MatchesBucket)?.matches) && (v as MatchesBucket).matches.length >= want,
  );
}
