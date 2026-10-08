import { env } from './env';
import { cached, peek } from './cache';

const BASE = 'https://api.henrikdev.xyz';

export const HENRIK_CONFIG = {
  apiKey: () => env('HENRIK_API_KEY'),
  name: () => env('VAL_NAME', 'Player'),
  tag: () => env('VAL_TAG', '0000'),
  region: () => env('VAL_REGION', 'na'),
  platform: () => env('VAL_PLATFORM', 'pc'),
};

class HenrikError extends Error {
  code: 'KEY_MISSING' | 'KEY_INVALID' | 'RATE_LIMITED' | 'NOT_FOUND' | 'HTTP';
  status?: number;
  constructor(code: HenrikError['code'], message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// Throttle: la key Basic expone 30 req/min (lo confirman las cabeceras
// x-ratelimit-limit/reset de cada respuesta). Operamos con margen: 27/min y
// espaciado mínimo para no disparar bursts; además, si las cabeceras dicen que
// queda poco presupuesto, esperamos a que Henrik reponga la ventana.
const MINUTE_MS = 60_000;
const MAX_REQ_PER_MINUTE = 27;
const MIN_GAP_MS = 2_200;
const requestTimes: number[] = [];
let rateRemaining: number | null = null;
let rateResetMs = MINUTE_MS;

function noteRateLimit(res: Response): void {
  const rem = Number(res.headers.get('x-ratelimit-remaining'));
  const reset = Number(res.headers.get('x-ratelimit-reset'));
  if (Number.isFinite(rem)) rateRemaining = rem;
  if (Number.isFinite(reset) && reset > 0) rateResetMs = reset * 1000;
}

async function throttle(): Promise<void> {
  if (rateRemaining != null && rateRemaining <= 1) {
    // Presupuesto casi agotado: espera a que Henrik reponga la ventana.
    await new Promise((resolve) => setTimeout(resolve, Math.min(rateResetMs, MINUTE_MS) + 250));
    rateRemaining = null;
  }
  const now = Date.now();
  while (requestTimes.length > 0 && now - requestTimes[0] > MINUTE_MS) {
    requestTimes.shift();
  }
  if (requestTimes.length >= MAX_REQ_PER_MINUTE) {
    const waitMs = MINUTE_MS - (now - requestTimes[0]) + 300;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  // Sin ráfagas: espaciado mínimo entre requests (el limiter de Henrik también
  // penaliza bursts cortos).
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

async function henrikFetch<T>(path: string): Promise<T> {
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
    noteRateLimit(res);
    if (res.status === 401 || res.status === 403) {
      res = await rawFetch(path, { Authorization: `Bearer ${key}` });
      noteRateLimit(res);
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
    noteRateLimit(res);
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
  return res.json() as Promise<T>;
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

type HenrikAccountData = {
  puuid?: string;
  name?: string;
  tag?: string;
  region?: string;
  account_level?: number;
  card?: { small?: string; large?: string };
  last_update?: string;
};

/** Solo fetch bruto (sin caché), para revalidaciones del bucket/refresh. */
export async function fetchHenrikAccountRaw(nameArg: string, tagArg: string): Promise<HenrikAccountData> {
  const name = encodeURIComponent(nameArg);
  const tag = encodeURIComponent(tagArg);
  const json = await henrikFetch<{ data?: HenrikAccountData }>(`/valorant/v2/account/${name}/${tag}`);
  return json?.data ?? {};
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

interface HenrikMatchPlayerStats {
  score?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  headshots?: number;
  bodyshots?: number;
  legshots?: number;
  damage?: { dealt?: number; received?: number };
}

/**
 * Puntuación de rendimiento de Riot (match v4, v4.10): un score propio y un
 * desglose por categoría, más etiquetas cualitativas ("double_up", "pass"...).
 */
export interface HenrikPlayerPerformance {
  score?: number | null;
  breakdown?: {
    adjusted_deaths?: number | null;
    adjusted_kills?: number | null;
    assists?: number | null;
    damage?: number | null;
    defuses?: number | null;
    plants?: number | null;
    trades?: number | null;
    utility_usage?: number | null;
  } | null;
  ratings?: {
    grade?: string | null;
    combat?: {
      damage?: string | null;
      death_impact?: string | null;
      kill_impact?: string | null;
      trades?: string | null;
    } | null;
    utility?: {
      assists?: string | null;
      defuses?: string | null;
      plants?: string | null;
      utility_usage?: string | null;
    } | null;
  } | null;
}

export interface HenrikMatchPlayer {
  puuid?: string;
  name?: string;
  tag?: string;
  team_id?: string;
  team_number?: number | null;
  agent?: { id?: string; name?: string };
  tier?: { id?: number; name?: string };
  stats?: HenrikMatchPlayerStats;
  economy?: {
    spent?: { overall?: number; average?: number };
    loadout_value?: { overall?: number; average?: number };
  };
  behavior?: { afk_rounds?: number };
  /** v4.10: score y desglose de rendimiento de Riot. */
  performance?: HenrikPlayerPerformance | null;
  /** v4.10: usos por habilidad (grenade/ability1/ability2/ultimate). */
  ability_casts?: {
    grenade?: number | null;
    ability1?: number | null;
    ability2?: number | null;
    ultimate?: number | null;
  } | null;
}

/** MVP de partida o de equipo (v4.10). */
export interface HenrikMvp {
  puuid?: string;
  name?: string;
  tag?: string;
  team?: string;
}

interface HenrikMatchTeam {
  team_id?: string | null;
  rounds?: { won?: number; lost?: number };
  won?: boolean | null;
  /** v4.10: MVP del equipo. */
  mvp?: HenrikMvp | null;
  /** v4.10: 1 = ganador, 2 = perdedor. */
  placement?: number | null;
  /** v4.10: vida restante del equipo (solo donde Riot la publica). */
  health?: { starting?: number; remaining?: number } | null;
  team_number?: number | null;
}

export interface HenrikKill {
  killer?: { puuid?: string; name?: string; team?: string };
  victim?: { puuid?: string; name?: string; team?: string };
  assistants?: { name?: string; puuid?: string }[];
  weapon?: { id?: string | null; name?: string | null; type?: string | null };
  round?: number;
  /** ms dentro de la ronda (v4): permite elegir la primera kill real del round. */
  time_in_round_in_ms?: number;
}

export interface HenrikMatchRound {
  id?: number;
  result?: string;
  winning_team?: string | null;
  /** v4.10: killer de la primera kill de la ronda (dato OFICIAL de Riot). */
  first_blood?: HenrikMvp | null;
  /** v4.10: rol del equipo ganador (Attacker/Defender). */
  winning_team_role?: string | null;
  ceremony?: string | null;
  plant?: { site?: string; player?: { name?: string; puuid?: string; team?: string } } | null;
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
    /** v4.10: MVP de la partida. */
    mvp?: HenrikMvp | null;
    /** v4.10: penalización de RR de cada party (dodge/afk). */
    party_rr_penaltys?: { party_id?: string; penalty?: number }[] | null;
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
  // --- v4.10: detalle del cambio competitivo (null en registros antiguos) ---
  /** Cola de la partida ("competitive", "unrated"...). */
  queue_id?: string | null;
  /** Duración de la partida en ms. */
  match_length?: number | null;
  /** Tier antes de esta partida (para detectar promociones/descensos). */
  tier_before_update?: { id?: number; name?: string } | null;
  /** RR antes de esta partida (rr_before_update + last_change = rr). */
  rr_before_update?: number | null;
  /** RR extra por rendimiento (MVP, marcador alto...). */
  rr_performance_bonus?: number | null;
  /** RR perdonado por el incentivo de mapa nuevo. */
  new_map_incentive_rr_forgiven?: number | null;
  /** MOVEMENT_UP / MOVEMENT_DOWN / MOVEMENT_NONE... */
  competitive_movement?: string | null;
  /** Penalización por AFK (en RR). */
  afk_penalty?: number | null;
  /** Penalización de RR aplicada (dodge, abandono...). */
  rr_penalty?: number | null;
  /** Partida de colocación (placement). */
  is_placement_match?: boolean | null;
  /** Se repuso el escudo de protección de rango con esta partida. */
  was_derank_protection_replenished?: boolean | null;
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
  const json = await henrikFetch<{ data?: { history?: HenrikMmrHistoryEntry[] } }>(
    `/valorant/v2/mmr-history/${affinity}/${platform}/${name}/${tag}`,
  );
  return json?.data?.history ?? [];
}

/** El warmup corre cada 15 min; el TTL del MMR va por encima para no expirar entre ciclos. */
export const MMR_TTL_MS = 20 * 60 * 1000;

export async function getHenrikMmrHistory(
  nameArg = HENRIK_CONFIG.name(),
  tagArg = HENRIK_CONFIG.tag(),
): Promise<HenrikMmrHistoryEntry[]> {
  return cached(henrikMmrKey(nameArg, tagArg), MMR_TTL_MS, () => fetchHenrikMmrHistoryRaw(nameArg, tagArg));
}

// ---------- MMR v3: rango actual, escudos de protección, pico y prestigio ----------

export interface HenrikMmrSeason {
  season?: { id?: string; short?: string };
  ranking_schema?: string;
  wins?: number;
  wins_with_placements?: number;
  games?: number;
  games_needed_for_rating?: number;
  end_tier?: { id?: number; name?: string };
  end_rr?: number;
  act_rank?: { id?: number; name?: string };
  act_wins?: { id?: number; name?: string }[];
  leaderboard_placement?: number | null;
  /** Mapa tier -> { delta, total } de prestigios ganados en esa temporada. */
  prestige?: Record<string, { delta?: number; total?: number }> | null;
}

export interface HenrikMmrV3 {
  account?: { name?: string; tag?: string; puuid?: string };
  current?: {
    tier?: { id?: number; name?: string };
    rr?: number;
    last_change?: number;
    elo?: number;
    games_needed_for_rating?: number;
    games_needed_for_leaderboard?: number;
    leaderboard_placement?: number | null;
    /** Escudos de protección de rango disponibles. */
    rank_protection_shields?: number;
    is_at_rank_protected_tier?: boolean | null;
    /** "Empty" | "Available" | ... */
    rank_protection_status?: string | null;
  };
  peak?: {
    season?: { id?: string; short?: string };
    ranking_schema?: string;
    tier?: { id?: number; name?: string };
    rr?: number;
  } | null;
  seasonal?: HenrikMmrSeason[];
  /** Mapa tier -> { count }: prestigios de por vida (GOLD, PLATINUM, DIAMOND...). */
  lifetime_prestige?: Record<string, { count?: number }> | null;
  ranked_state?: {
    is_act_rank_badge_hidden?: boolean | null;
    is_leaderboard_anonymized?: boolean | null;
  };
  /** Último cambio competitivo, con el mismo detalle que el historial. */
  latest_update?: HenrikMmrHistoryEntry | null;
}

export const MMR_V3_TTL_MS = 20 * 60 * 1000;

export function henrikMmrV3Key(nameArg: string, tagArg: string): string {
  return `henrik:mmr-v3:${encodeURIComponent(nameArg)}:${encodeURIComponent(tagArg)}`;
}

export async function fetchHenrikMmrV3Raw(nameArg: string, tagArg: string): Promise<HenrikMmrV3> {
  const affinity = HENRIK_CONFIG.region();
  const platform = HENRIK_CONFIG.platform();
  const json = await henrikFetch<{ data?: HenrikMmrV3 }>(
    `/valorant/v3/mmr/${affinity}/${platform}/${encodeURIComponent(nameArg)}/${encodeURIComponent(tagArg)}`,
  );
  return json?.data ?? {};
}

export async function getHenrikMmrV3(
  nameArg = HENRIK_CONFIG.name(),
  tagArg = HENRIK_CONFIG.tag(),
): Promise<HenrikMmrV3> {
  return cached(henrikMmrV3Key(nameArg, tagArg), MMR_V3_TTL_MS, () => fetchHenrikMmrV3Raw(nameArg, tagArg));
}

// ---------- Historial MMR almacenado (más allá de las ~20 partidas) ----------

export interface HenrikStoredMmrPage {
  entries: HenrikMmrHistoryEntry[];
  /** Metadatos de paginación (total/returned del servidor). */
  results?: { after?: number; before?: number; returned?: number; total?: number } | null;
}

export function henrikStoredMmrKey(nameArg: string, tagArg: string, size: number, page: number): string {
  return `henrik:stored-mmr:${encodeURIComponent(nameArg)}:${encodeURIComponent(tagArg)}:${size}:${page}`;
}

export async function fetchHenrikStoredMmrHistoryRaw(
  nameArg: string,
  tagArg: string,
  size = 100,
  page = 0,
): Promise<HenrikStoredMmrPage> {
  const affinity = HENRIK_CONFIG.region();
  const platform = HENRIK_CONFIG.platform();
  const qs = new URLSearchParams({ size: String(size), page: String(page) });
  const json = await henrikFetch<{ data?: HenrikMmrHistoryEntry[]; results?: HenrikStoredMmrPage['results'] }>(
    `/valorant/v2/stored-mmr-history/${affinity}/${platform}/${encodeURIComponent(nameArg)}/${encodeURIComponent(tagArg)}?${qs}`,
  );
  const data = json?.data;
  return {
    entries: Array.isArray(data) ? data : [],
    results: json?.results ?? null,
  };
}

/** El histórico almacenado cambia como mucho al ritmo de las partidas: 6 h. */
export const STORED_MMR_TTL_MS = 6 * 60 * 60 * 1000;

export async function getHenrikStoredMmrHistory(
  nameArg = HENRIK_CONFIG.name(),
  tagArg = HENRIK_CONFIG.tag(),
  size = 100,
  page = 0,
): Promise<HenrikStoredMmrPage> {
  return cached(henrikStoredMmrKey(nameArg, tagArg, size, page), STORED_MMR_TTL_MS, () =>
    fetchHenrikStoredMmrHistoryRaw(nameArg, tagArg, size, page),
  );
}

// ---------- Accolades (récords y hitos de la cuenta) ----------

export type HenrikAccoladeKind =
  | 'kills'
  | 'first_blood'
  | 'damage_per_round'
  | 'clutches'
  | 'aces'
  | 'trades'
  | 'headshot_percentage'
  | 'distinction'
  | 'assists'
  | 'top_frag'
  | 'plants'
  | 'mvp';

export interface HenrikAccoladeMetric {
  id?: string;
  type?: HenrikAccoladeKind | null;
  /** Nº de veces conseguido. */
  count?: number;
  /** Mejor valor histórico de ese hito. */
  best_value?: number;
}

export interface HenrikAccolades {
  account?: { name?: string; tag?: string; puuid?: string };
  summary?: {
    all_time?: HenrikAccoladeMetric[];
    seasons?: { season?: { id?: string; short?: string }; accolades?: HenrikAccoladeMetric[] }[];
  } | null;
  matches?: {
    match_id?: string | null;
    started_at?: string | null;
    players?: {
      puuid?: string;
      accolades?: { id?: string; type?: HenrikAccoladeKind | null; value?: number; is_act_record?: boolean }[];
    }[];
  }[] | null;
}

export function henrikAccoladesKey(nameArg: string, tagArg: string): string {
  return `henrik:accolades:${encodeURIComponent(nameArg)}:${encodeURIComponent(tagArg)}`;
}

export async function fetchHenrikAccoladesRaw(nameArg: string, tagArg: string): Promise<HenrikAccolades> {
  const affinity = HENRIK_CONFIG.region();
  const platform = HENRIK_CONFIG.platform();
  const json = await henrikFetch<{ data?: HenrikAccolades }>(
    `/valorant/v1/accolades/${affinity}/${platform}/${encodeURIComponent(nameArg)}/${encodeURIComponent(tagArg)}`,
  );
  return json?.data ?? {};
}

/** Los récords se mueven despacio: 6 h de caché. */
export const ACCOLADES_TTL_MS = 6 * 60 * 60 * 1000;

export async function getHenrikAccolades(
  nameArg = HENRIK_CONFIG.name(),
  tagArg = HENRIK_CONFIG.tag(),
): Promise<HenrikAccolades> {
  return cached(henrikAccoladesKey(nameArg, tagArg), ACCOLADES_TTL_MS, () => fetchHenrikAccoladesRaw(nameArg, tagArg));
}

// ---------- Maestría de agentes ----------

export interface HenrikAgentMasteryEntry {
  agent?: { id?: string; name?: string | null };
  flourish?: { short_level?: number | null; long_level?: number | null };
  tracks?: { id?: string; name?: string | null; level?: number | null }[];
  modules?: { id?: string | null; name?: string | null; stat?: { id?: string; name?: string | null }; value?: number }[] | null;
}

export interface HenrikAgentMastery {
  account?: { name?: string; tag?: string; puuid?: string };
  agents?: HenrikAgentMasteryEntry[];
}

export function henrikMasteryKey(nameArg: string, tagArg: string): string {
  return `henrik:mastery:${encodeURIComponent(nameArg)}:${encodeURIComponent(tagArg)}`;
}

export async function fetchHenrikAgentMasteryRaw(nameArg: string, tagArg: string): Promise<HenrikAgentMastery> {
  const affinity = HENRIK_CONFIG.region();
  const platform = HENRIK_CONFIG.platform();
  const json = await henrikFetch<{ data?: HenrikAgentMastery }>(
    `/valorant/v1/agent-mastery/${affinity}/${platform}/${encodeURIComponent(nameArg)}/${encodeURIComponent(tagArg)}`,
  );
  return json?.data ?? {};
}

/** La maestría sube jugando: 12 h es de sobra. */
export const MASTERY_TTL_MS = 12 * 60 * 60 * 1000;

export async function getHenrikAgentMastery(
  nameArg = HENRIK_CONFIG.name(),
  tagArg = HENRIK_CONFIG.tag(),
): Promise<HenrikAgentMastery> {
  return cached(henrikMasteryKey(nameArg, tagArg), MASTERY_TTL_MS, () => fetchHenrikAgentMasteryRaw(nameArg, tagArg));
}

// ---------- Premier v2 (equipo, roster y temporadas) ----------

export interface HenrikPremierSeason {
  id?: string;
  name?: string | null;
  enrolled?: boolean;
  crest?: string;
  stats?: { wins?: number; losses?: number; matches?: number; rounds?: { won?: number; lost?: number } };
  placement?: { points?: number; conference?: string; division?: number; is_provisional?: boolean };
  promotion_applied?: boolean;
  has_earned_promotion_for_next_season?: boolean;
  has_earned_prestige?: boolean;
}

export interface HenrikPremierTeam {
  id?: string;
  name?: string;
  tag?: string;
  created_at?: string;
  customization?: { icon?: string; image?: string; primary?: string; secondary?: string; tertiary?: string };
  member?: { puuid?: string; role?: { id?: number; name?: string }; joined_at?: string }[];
  current_season?: HenrikPremierSeason | null;
  seasons?: HenrikPremierSeason[];
}

export function henrikPremierKey(kind: 'player' | 'team', id: string): string {
  return `henrik:premier:${kind}:${encodeURIComponent(id)}`;
}

async function premierFetch(path: string): Promise<HenrikPremierTeam | null> {
  const json = await henrikFetch<{ data?: HenrikPremierTeam }>(path);
  const data = json?.data;
  return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
}

export async function fetchHenrikPremierPlayerRaw(nameArg: string, tagArg: string): Promise<HenrikPremierTeam | null> {
  const affinity = HENRIK_CONFIG.region();
  return premierFetch(`/valorant/v2/premier/players/${affinity}/${encodeURIComponent(nameArg)}/${encodeURIComponent(tagArg)}`);
}

export async function fetchHenrikPremierTeamRaw(teamId: string): Promise<HenrikPremierTeam | null> {
  const affinity = HENRIK_CONFIG.region();
  return premierFetch(`/valorant/v2/premier/teams/${affinity}/${encodeURIComponent(teamId)}`);
}

/** El equipo Premier cambia poco (roster/resultados): 6 h. */
export const PREMIER_TTL_MS = 6 * 60 * 60 * 1000;

export async function getHenrikPremierPlayer(
  nameArg = HENRIK_CONFIG.name(),
  tagArg = HENRIK_CONFIG.tag(),
): Promise<HenrikPremierTeam | null> {
  const id = `${nameArg}#${tagArg}`;
  return cached(henrikPremierKey('player', id), PREMIER_TTL_MS, () => fetchHenrikPremierPlayerRaw(nameArg, tagArg));
}

export async function getHenrikPremierTeam(teamId: string): Promise<HenrikPremierTeam | null> {
  return cached(henrikPremierKey('team', teamId), PREMIER_TTL_MS, () => fetchHenrikPremierTeamRaw(teamId));
}

/** Nombre#tag de un puuid (para resolver los miembros del roster de Premier). */
export async function fetchHenrikAccountByPuuidRaw(puuid: string): Promise<HenrikAccountData> {
  const json = await henrikFetch<{ data?: HenrikAccountData }>(`/valorant/v2/by-puuid/account/${encodeURIComponent(puuid)}`);
  return json?.data ?? {};
}

export const ACCOUNT_BY_PUUID_TTL_MS = 24 * 60 * 60 * 1000;

export function henrikAccountByPuuidKey(puuid: string): string {
  return `henrik:account-puuid:${encodeURIComponent(puuid)}`;
}

export async function getHenrikAccountByPuuid(puuid: string): Promise<HenrikAccountData> {
  return cached(henrikAccountByPuuidKey(puuid), ACCOUNT_BY_PUUID_TTL_MS, () => fetchHenrikAccountByPuuidRaw(puuid));
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
// El warmup corre cada 15 min: el TTL va por encima para que el bucket nunca
// expire entre ciclos (si no, la primera petición del usuario bloquea en la red).
export const BUCKET_TTL_MS = 20 * 60 * 1000;
const BUCKET_PREFIX = 'henrik:matches:v2';

export interface MatchesBucket {
  /** ms epoch de la última sincronización exitosa */
  updatedAt: number;
  /** hasta BUCKET_LIMIT partidas competitivas, más recientes primero */
  matches: HenrikMatch[];
  /** true = la API devolvió menos de lo pedido (no hay más historial): evita re-syncs por `want`. */
  exhausted?: boolean;
}

function bucketKey(nameEncoded: string, tagEncoded: string): string {
  return `${BUCKET_PREFIX}:${nameEncoded}:${tagEncoded}`;
}

/** Identificador único de partida (clave de dedupe global del bucket/archivo). */
export function henrikMatchId(m: HenrikMatch): string {
  return m.metadata?.match_id ?? '';
}

const matchId = henrikMatchId;

export async function fetchMatchesPage(
  affinity: string,
  platform: string,
  name: string,
  tag: string,
  mode: string,
  start: number,
  size: number,
): Promise<HenrikMatch[]> {
  const qs = new URLSearchParams({ mode, size: String(size), start: String(start) });
  const json = await henrikFetch<{ status?: number; data?: HenrikMatch[] }>(
    `/valorant/v4/matches/${affinity}/${platform}/${name}/${tag}?${qs}`,
  );
  return json?.data ?? [];
}

export const PAGE_SIZE = 10;

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
    // Las incompletas NO entran en `seen`: su payload es provisional (sin
    // rondas, sin tier final) y el archivo las rechaza; si se marcaran como
    // vistas, al completarse se descartarían por duplicadas y se perderían.
    if (m.metadata?.is_completed === false) continue;
    const id = matchId(m);
    if (id) seen.add(id);
  }
  // Si la página 0 es toda nueva (sin solape con el bucket), las páginas
  // profundas también pueden traer novedades y NO se saltan: saltarlas con
  // >10 partidas nuevas por ciclo abría huecos permanentes.
  let page0Overlap = false;
  // true = la API confirmó que no hay más historial (evita pedir de nuevo el
  // mismo `want` en cada lectura cuando la cuenta tiene menos de 40 partidas).
  let exhausted = false;

  const pagesNeeded = Math.ceil(target / PAGE_SIZE);
  for (let p = 0; p < pagesNeeded; p++) {
    const start = p * PAGE_SIZE;
    const size = Math.min(PAGE_SIZE, target - start);
    if (size <= 0) break;

    // Páginas ya cubiertas por el bucket previo: se saltan (la página 0 se
    // descarga siempre para detectar partidas nuevas).
    if (p !== 0 && page0Overlap && start + size <= baseLen) continue;

    let batch: HenrikMatch[];
    try {
      batch = await fetchMatchesPage(affinity, platform, name, tag, mode, start, size);
    } catch (err) {
      // Con datos en mano, preferimos devolverlos antes que fallar todo.
      if (err instanceof HenrikError && err.code === 'RATE_LIMITED' && (fresh.length + deep.length) > 0) break;
      throw err;
    }
    if (!batch.length) {
      exhausted = true;
      break;
    }

    for (const m of batch) {
      const id = matchId(m);
      if (!id) continue;
      if (seen.has(id)) {
        if (p === 0) page0Overlap = true;
        continue;
      }
      // Incompleta: no se fija ni se archiva; el próximo ciclo la traerá
      // completada (no está en `seen`, así que no se descarta).
      if (m.metadata?.is_completed === false) continue;
      seen.add(id);
      (p === 0 ? fresh : deep).push(m);
    }
    // La API devolvió menos de lo pedido => no hay más historial.
    if (batch.length < size) {
      exhausted = true;
      break;
    }
  }

  // Orden final garantizado (más reciente primero): la API no promete orden
  // total y el slice a 40 debe expulsar las más viejas, no las que vengan
  // desordenadas en un batch.
  const freshIds = new Set(fresh.map(matchId));
  const baseDeduped = allOld.filter((m) => !freshIds.has(matchId(m)));
  const all = [...fresh, ...baseDeduped, ...deep]
    .sort((a, b) => henrikMatchTimestamp(b) - henrikMatchTimestamp(a))
    .slice(0, BUCKET_LIMIT);

  // Archivo acumulativo (estilo tracker.gg): toda partida nueva descargada
  // se guarda para siempre, aunque luego salga del bucket de 40. Best-effort:
  // un fallo del archivo no debe romper el sync del bucket.
  const newOnes = [...fresh, ...deep];
  if (newOnes.length) {
    try {
      const { mergeIntoArchive } = await import('./archive');
      mergeIntoArchive(nameArg, tagArg, newOnes);
    } catch (err) {
      console.error(`[archive] no se pudo archivar ${nameArg}#${tagArg}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { updatedAt: Date.now(), matches: all, exhausted };
}

/**
 * Última copia conocida del bucket (aunque su TTL haya vencido). Respaldo
 * offline: cuando la red falla, el resumen sigue sirviendo el histórico.
 */
export function peekMatchesBucket(nameArg: string, tagArg: string): MatchesBucket | null {
  return peek<MatchesBucket>(bucketKey(encodeURIComponent(nameArg), encodeURIComponent(tagArg)));
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
    (v) => {
      const b = v as MatchesBucket;
      return Array.isArray(b?.matches) && (b.matches.length >= want || b.exhausted === true);
    },
  );
}
