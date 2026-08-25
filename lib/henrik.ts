import { env } from './env';
import { cached } from './cache';

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

export async function getHenrikAccount(
  nameArg = HENRIK_CONFIG.name(),
  tagArg = HENRIK_CONFIG.tag(),
): Promise<HenrikAccount> {
  const name = encodeURIComponent(nameArg);
  const tag = encodeURIComponent(tagArg);
  const json = await cached(`henrik:account:${name}:${tag}`, 60 * 60 * 1000, () =>
    henrikFetch(`/valorant/v2/account/${name}/${tag}`),
  );
  const data = json?.data;
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

export async function getHenrikMmrHistory(
  nameArg = HENRIK_CONFIG.name(),
  tagArg = HENRIK_CONFIG.tag(),
): Promise<HenrikMmrHistoryEntry[]> {
  const name = encodeURIComponent(nameArg);
  const tag = encodeURIComponent(tagArg);
  const affinity = HENRIK_CONFIG.region();
  const platform = HENRIK_CONFIG.platform();
  const json = await cached(`henrik:mmr-history:${name}:${tag}`, 10 * 60 * 1000, async () =>
    henrikFetch(`/valorant/v2/mmr-history/${affinity}/${platform}/${name}/${tag}`),
  );
  return json?.data?.history ?? [];
}

const PAGE_SIZE = 10;
const PAGE_DELAY_MS = 1_600;

export async function getHenrikMatches(
  limit = 20,
  mode = 'competitive',
  nameArg = HENRIK_CONFIG.name(),
  tagArg = HENRIK_CONFIG.tag(),
): Promise<HenrikMatch[]> {
  const name = encodeURIComponent(nameArg);
  const tag = encodeURIComponent(tagArg);
  const affinity = HENRIK_CONFIG.region();
  const platform = HENRIK_CONFIG.platform();

  const all: HenrikMatch[] = [];
  for (let start = 0; start < limit; start += PAGE_SIZE) {
    const size = Math.min(PAGE_SIZE, limit - all.length);
    if (size <= 0) break;
    if (all.length > 0) {
      // Espaciado entre páginas para respetar el rate limit (Basic: 30 req/min)
      await new Promise((resolve) => setTimeout(resolve, PAGE_DELAY_MS));
    }
    const qs = new URLSearchParams({ mode, size: String(size), start: String(start) });
    try {
      const json = (await henrikFetch(
        `/valorant/v4/matches/${affinity}/${platform}/${name}/${tag}?${qs}`,
      )) as { status?: number; data?: HenrikMatch[] };
      const batch = json?.data ?? [];
      if (!batch.length) break;
      all.push(...batch);
      if (batch.length < size) break;
    } catch (err) {
      // Con datos parciales en mano, preferimos devolverlos antes que fallar todo.
      if (err instanceof HenrikError && err.code === 'RATE_LIMITED' && all.length > 0) break;
      throw err;
    }
  }
  return all;
}
