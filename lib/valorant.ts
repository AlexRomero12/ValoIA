import { env } from './env';
import { cached, cacheSet, cacheUpdatedAt } from './cache';
import { getArchiveMatches } from './archive';
import {
  HENRIK_CONFIG,
  getHenrikAccount,
  getMatchesBucket,
  getHenrikMmrHistory,
  henrikMmrKey,
  henrikMatchId,
  henrikMatchTimestamp,
  henrikRoundsPlayed,
  BUCKET_LIMIT,
  type HenrikMatch,
} from './henrik';
import { requireProfile, type ProfileViewer } from './profiles';
import { computeStats, groupMatches, toStatBlock, type PlayerStats, type StatBlock } from './stats';

export const VAL_CONFIG = {
  name: () => env('VAL_NAME', 'Player'),
  tag: () => env('VAL_TAG', '0000'),
  shard: () => env('VAL_SHARD', 'latam'),
  cluster: () => env('VAL_CLUSTER', 'americas'),
  apiKey: () => env('RIOT_API_KEY'),
};

export class RiotApiError extends Error {
  code: 'KEY_MISSING' | 'KEY_EXPIRED' | 'RATE_LIMITED' | 'HTTP' | 'NETWORK' | 'NOT_FOUND';
  status?: number;
  constructor(code: RiotApiError['code'], message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function riotFetch(path: string, base: string): Promise<unknown> {
  const key = VAL_CONFIG.apiKey();
  if (!key) {
    throw new RiotApiError(
      'KEY_MISSING',
      'Falta RIOT_API_KEY. Genera una en https://developer.riotgames.com y pégala en .env',
    );
  }
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      headers: { 'X-Riot-Token': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    throw new RiotApiError('NETWORK', `Sin conexión con la API de Riot: ${e instanceof Error ? e.message : e}`);
  }
  if (res.status === 403) {
    throw new RiotApiError(
      'KEY_EXPIRED',
      'RIOT_API_KEY inválida o expirada (las keys personales duran 24h). Renuévala en developer.riotgames.com y actualiza .env',
      403,
    );
  }
  if (res.status === 429) {
    throw new RiotApiError('RATE_LIMITED', 'Rate limit de la API de Riot alcanzado, reintenta en un minuto', 429);
  }
  if (res.status === 404) {
    throw new RiotApiError('NOT_FOUND', 'Recurso no encontrado en la API de Riot', 404);
  }
  if (!res.ok) {
    throw new RiotApiError('HTTP', `API de Riot HTTP ${res.status}`, res.status);
  }
  return res.json();
}

export interface ValAccount {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export async function getAccount(): Promise<ValAccount> {
  const name = encodeURIComponent(VAL_CONFIG.name());
  const tag = encodeURIComponent(VAL_CONFIG.tag());
  const data = (await cached(
    `val:account:${name}:${tag}`,
    60 * 60 * 1000,
    async () =>
      riotFetch(
        `/riot/account/v1/accounts/by-riot-id/${name}/${tag}`,
        `https://${VAL_CONFIG.cluster()}.api.riotgames.com`,
      ),
  )) as { puuid?: string; gameName?: string; tagLine?: string };
  if (!data?.puuid) throw new RiotApiError('NOT_FOUND', `Cuenta ${VAL_CONFIG.name()}#${VAL_CONFIG.tag()} no encontrada`);
  return { puuid: data.puuid, gameName: data.gameName ?? VAL_CONFIG.name(), tagLine: data.tagLine ?? VAL_CONFIG.tag() };
}

interface MatchListEntry {
  matchId: string;
  gameStartTimeMillis: number;
  teamId: string;
}

interface MatchlistResponse {
  puuid: string;
  history: MatchListEntry[];
}

export async function getMatchlist(puuid: string): Promise<MatchlistResponse> {
  return (await cached(`val:matchlist:${puuid}`, 10 * 60 * 1000, async () =>
    riotFetch(
      `/val/match/v1/matchlists/by-puuid/${puuid}`,
      `https://${VAL_CONFIG.shard()}.api.riotgames.com`,
    ),
  )) as MatchlistResponse;
}

interface DamageRow {
  receiver?: string;
  damage?: number;
  legshots?: number;
  bodyshots?: number;
  headshots?: number;
}

interface RiotPlayerStats {
  score?: number;
  roundsPlayed?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
}

export interface ValPlayer {
  puuid?: string;
  gameName?: string;
  tagLine?: string;
  teamId?: string;
  characterId?: string;
  stats?: RiotPlayerStats;
  competitiveTier?: number;
  damage?: DamageRow[];
}

interface TeamInfo {
  teamId?: string;
  won?: boolean;
  roundsPlayed?: number;
  roundsWon?: number;
}

export interface ValMatch {
  matchInfo: {
    matchId?: string;
    mapId?: string;
    gameStartMillis?: number;
    gameLengthMillis?: number;
    isCompleted?: boolean;
    queueID?: string;
  };
  players: ValPlayer[];
  teams: TeamInfo[];
}

const MATCH_TTL_COMPLETED = Number.MAX_SAFE_INTEGER;
const MATCH_TTL_INCOMPLETE = 5 * 60 * 1000;

export async function getMatch(matchId: string): Promise<ValMatch> {
  const raw = await cached(`val:match:${matchId}`, MATCH_TTL_INCOMPLETE, async () =>
    riotFetch(`/val/match/v1/matches/${matchId}`, `https://${VAL_CONFIG.shard()}.api.riotgames.com`),
  );
  const match = raw as ValMatch;
  if (match.matchInfo?.isCompleted && match.players?.length > 0) {
    cacheSet(`val:match:${matchId}`, match, MATCH_TTL_COMPLETED);
  }
  return match;
}

// ---------- Contenido (agentes/mapas) vía valorant-api.com (sin auth) ----------

interface ContentEntry {
  name: string;
  icon: string | null;
  /** Rol del agente (Duelist/Initiator/Controller/Sentinel) — solo agentes */
  role?: string | null;
}

interface ContentDicts {
  agents: Record<string, ContentEntry>;
  maps: Record<string, ContentEntry>;
  weapons: Record<string, ContentEntry & { category: string | null }>;
}

let contentPromise: Promise<ContentDicts> | null = null;

async function loadContent(): Promise<ContentDicts> {
  const fallback: ContentDicts = { agents: {}, maps: {}, weapons: {} };
  try {
    const [agentsRes, mapsRes, weaponsRes] = await Promise.all([
      fetch('https://valorant-api.com/v1/agents?isPlayableCharacter=true', { signal: AbortSignal.timeout(15_000) }),
      fetch('https://valorant-api.com/v1/maps', { signal: AbortSignal.timeout(15_000) }),
      fetch('https://valorant-api.com/v1/weapons', { signal: AbortSignal.timeout(15_000) }),
    ]);
    const agents = agentsRes.ok
      ? (await agentsRes.json()) as { data?: { uuid?: string; displayName?: string; displayIcon?: string | null; role?: { displayName?: string } | null }[] }
      : null;
    const maps = mapsRes.ok
      ? (await mapsRes.json()) as { data?: { uuid?: string; displayName?: string; mapUrl?: string; displayIcon?: string | null }[] }
      : null;
    const weapons = weaponsRes.ok
      ? (await weaponsRes.json()) as { data?: { displayName?: string; displayIcon?: string | null; category?: string }[] }
      : null;
    const dict: ContentDicts = { agents: {}, maps: {}, weapons: {} };
    for (const a of agents?.data ?? []) {
      if (a.uuid && a.displayName) {
        dict.agents[a.uuid.toLowerCase()] = {
          name: a.displayName,
          icon: a.displayIcon ?? null,
          role: a.role?.displayName ?? null,
        };
      }
    }
    for (const m of maps?.data ?? []) {
      if (m.mapUrl && m.displayName) {
        dict.maps[m.mapUrl.toLowerCase()] = {
          name: m.displayName.replace(/^[^_]*_/, '').replace(/_/g, ' '),
          icon: m.displayIcon ?? null,
        };
      }
    }
    for (const w of weapons?.data ?? []) {
      if (w.displayName) {
        dict.weapons[w.displayName.toLowerCase()] = {
          name: w.displayName,
          icon: w.displayIcon ?? null,
          category: typeof w.category === 'string' ? (w.category.split('::').pop() ?? null) : null,
        };
      }
    }
    return dict;
  } catch {
    return fallback;
  }
}

export function getContent(): Promise<ContentDicts> {
  // v2: el dict ahora incluye armas; la clave nueva evita servir desde el cache
  // una entrada vieja sin `weapons` (cacheada 24 h antes de este cambio).
  if (!contentPromise) contentPromise = cached('val:content:v3', 24 * 60 * 60 * 1000, loadContent);
  return contentPromise;
}

function mapDisplayName(mapId: string | undefined, dicts: ContentDicts): string {
  if (!mapId) return '?';
  const known = dicts.maps[mapId.toLowerCase()];
  if (known) return known.name;
  const tail = mapId.split('/').pop() ?? mapId;
  const cleaned = tail.replace(/^.*?_/, '').replace(/_/g, ' ');
  for (const name of ['Ascent', 'Bind', 'Breeze', 'Fracture', 'Haven', 'Icebox', 'Lotus', 'Pearl', 'Split', 'Sunset', 'Abyss', 'Corrode']) {
    if (cleaned.toLowerCase().includes(name.toLowerCase())) return name;
  }
  return cleaned || mapId;
}

// ---------- Agregación ----------

export interface ArsenalRow {
  weapon: string;
  /** Categoría del arma (Rifle, Sniper, Melee...) según valorant-api.com */
  type: string | null;
  icon: string | null;
  kills: number;
  deaths: number;
  kd: number;
  /** Primeras sangre del jugador con esta arma (primer kill del round) */
  firstBloods: number;
}

export interface ValArsenal {
  rows: ArsenalRow[];
  totalKills: number;
  totalFirstBloods: number;
}

export interface MatchSummary {
  matchId: string;
  date: string;
  timestamp: number;
  map: string;
  agent: string;
  won: boolean;
  rounds: number;
  roundsWon: number;
  roundsLost: number;
  kills: number;
  deaths: number;
  assists: number;
  acs: number;
  adr: number;
  hsPct: number;
  /** Primeras sangres del jugador (primer kill del round). Solo Henrik. */
  firstBloods?: number;
  /** Primeras muertes del jugador (primera muerte del round). Solo Henrik. */
  firstDeaths?: number;
  score?: number;
  damageDealt?: number;
  headshots?: number;
  shots?: number;
  tier: number;
  tierChange: number;
  /**
   * Tier sin respaldo del mmr-history (viene del detalle del match, que es el
   * tier previo al partido): el punto de rango es aproximado y en la frontera
   * con historial puede saltar ±1 tier de más. El cliente lo marca con ~.
   */
  tierApprox?: boolean;
  durationMin: number;
  rrDelta?: number | null;
  rr?: number | null;
  elo?: number | null;
  eloDelta?: number | null;
  agentIcon?: string | null;
  mapIcon?: string | null;
  /** Rol del agente, cuando el catálogo de contenido lo tiene */
  agentRole?: string | null;
}

export type ValKpisBlock = StatBlock & { losses: number; fb?: number; fd?: number };

export interface ValSummary {
  generatedAt: string;
  account: ValAccount;
  window: { days: number; since: string; fetchedMatches: number; consideredMatches: number; archivedMatches?: number; seasonShort?: string | null; rrTotal?: number | null; rrMissing?: number; eloTotal?: number | null; syncedAt?: string | null; mmrSyncedAt?: string | null; truncated?: boolean };
  kpis: ValKpisBlock;
  /** Ventana anterior de igual duración (deltas de KPIs); null si no hay datos. */
  prev?: ValKpisBlock | null;
  currentTier: number;
  startTier: number;
  currentElo?: number | null;
  currentRR?: number | null;
  byAgent: (StatBlock & { agent: string })[];
  byMap: (StatBlock & { map: string })[];
  matches: MatchSummary[];
  /** Solo proveedor Henrik: uso de armas derivado del kill feed de las partidas en ventana */
  arsenal?: ValArsenal;
}

export interface AggregateOptions {
  days: number;
  maxFetch?: number;
  refresh?: boolean;
  /** 'current' = filtrar por la temporada del partido más reciente; o un season.short concreto */
  season?: string;
  /** id del perfil (lib/profiles.ts); default = primer perfil permitido */
  playerId?: string;
  /** Quién consulta: el admin ve todo; cada usuario, solo sus perfiles */
  viewer?: ProfileViewer;
  /** Cuenta específica de un miembro multi-cuenta; default = su cuenta principal */
  accountName?: string;
  accountTag?: string;
}

export type Provider = 'henrik' | 'riot';

export function getProvider(): Provider | null {
  if (HENRIK_CONFIG.apiKey()) return 'henrik';
  if (VAL_CONFIG.apiKey()) return 'riot';
  return null;
}

export async function getValSummary(opts: AggregateOptions): Promise<ValSummary> {
  const provider = getProvider();
  if (provider === 'henrik') return getValSummaryHenrik(opts);
  if (provider === 'riot') return getValSummaryRiot(opts);
  throw new RiotApiError(
    'KEY_MISSING',
    [
      'Sin API key configurada. Opciones:',
      '1) HENRIK_API_KEY — gratis e instantánea en https://api.henrikdev.xyz/dashboard/ (recomendada)',
      '2) RIOT_API_KEY — developer.riotgames.com (nota: VAL-MATCH-V1 suele estar bloqueada para keys de desarrollo)',
    ].join('\n'),
  );
}

// ---------- Proveedor Henrik ----------

/** Primeras sangres/muertes del jugador desde el kill feed de una partida. */
function henrikFirsts(m: HenrikMatch, puuid: string): { firstBloods: number; firstDeaths: number } {
  const seenRounds = new Set<number>();
  let firstBloods = 0;
  let firstDeaths = 0;
  for (const k of m.kills ?? []) {
    const round = k.round ?? -1;
    if (seenRounds.has(round)) continue;
    seenRounds.add(round);
    if (k.killer?.puuid === puuid) firstBloods += 1;
    if (k.victim?.puuid === puuid) firstDeaths += 1;
  }
  return { firstBloods, firstDeaths };
}

/** Stats agregadas de partidas Henrik sin construir MatchSummary (ventana anterior). */
function henrikStatsOf(list: HenrikMatch[], puuid: string, rrOf: (matchId: string) => number | null): PlayerStats {
  return computeStats(
    list.map((m) => {
      const me = (m.players ?? []).find((p) => p.puuid === puuid);
      const myTeam =
        (m.teams ?? []).find((t) => t.team_id != null && t.team_id === me?.team_id) ??
        (m.teams ?? [])[0];
      const rds = henrikRoundsPlayed(m);
      const s = me?.stats ?? {};
      const roundsWon = myTeam?.rounds?.won ?? 0;
      const hs = s.headshots ?? 0;
      const body = s.bodyshots ?? 0;
      const leg = s.legshots ?? 0;
      const shots = hs + body + leg;
      const dmgDealt = s.damage?.dealt ?? 0;
      const { firstBloods, firstDeaths } = henrikFirsts(m, puuid);
      return {
        won: Boolean(myTeam?.won),
        rounds: rds,
        roundsWon,
        roundsLost: myTeam?.rounds?.lost ?? Math.max(0, rds - roundsWon),
        kills: s.kills ?? 0,
        deaths: s.deaths ?? 0,
        acs: rds ? Math.round((s.score ?? 0) / rds) : 0,
        adr: rds ? Math.round(dmgDealt / rds) : 0,
        hsPct: shots ? Math.round((hs / shots) * 1000) / 10 : 0,
        score: s.score ?? 0,
        damageDealt: dmgDealt,
        headshots: hs,
        shots,
        rrDelta: rrOf(m.metadata?.match_id ?? ''),
        firstBloods,
        firstDeaths,
      };
    }),
  );
}

async function getValSummaryHenrik(opts: AggregateOptions): Promise<ValSummary> {
  const member = requireProfile(opts.playerId, opts.viewer);
  const acctName = opts.accountName ?? member.name;
  const acctTag = opts.accountTag ?? member.tag;
  const account = await getHenrikAccount(acctName, acctTag);
  const sinceMs = Date.now() - opts.days * 24 * 60 * 60 * 1000;
  const seasonMode = Boolean(opts.season);
  const dicts = await getContent();
  const agentIconByName = new Map(Object.values(dicts.agents).map((e) => [e.name.toLowerCase(), e.icon]));
  const agentRoleByName = new Map(Object.values(dicts.agents).map((e) => [e.name.toLowerCase(), e.role ?? null]));
  const mapIconByName = new Map(Object.values(dicts.maps).map((e) => [e.name.toLowerCase(), e.icon]));

  // En modo temporada pedimos más historial para cubrir el acto completo.
  // El bucket hace sync incremental: con todo llegado, un refresh cuesta 1 request.
  const want = Math.min(opts.maxFetch ?? (seasonMode ? BUCKET_LIMIT : 20), BUCKET_LIMIT);
  const bucket = await getMatchesBucket(acctName, acctTag, want);

  // Archivo acumulativo (estilo tracker.gg): el bucket solo cubre 40 partidas,
  // pero el archivo guarda todo lo sincronizado históricamente. La unión
  // garantiza que las agregaciones de temporada/ventanas largas no queden
  // recortadas cuando el jugador pasa de 40 partidas en el período.
  const archived = getArchiveMatches(acctName, acctTag);
  const seenIds = new Set<string>();
  const matches: HenrikMatch[] = [];
  for (const m of [...bucket.matches, ...archived]) {
    const id = henrikMatchId(m);
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);
    matches.push(m);
  }
  // Ventana posiblemente recortada: en modo días, si el bucket llegó al tope
  // pedido y ni el archivo cubre hasta `sinceMs`, hay partidas fuera de lo
  // sincronizado y los KPIs/RR se presentan como ventana completa sin serlo.
  const oldestCovered = [...bucket.matches, ...archived]
    .map(henrikMatchTimestamp)
    .filter((t) => t > 0)
    .reduce((a, b) => Math.min(a, b), Infinity);
  const truncated = !seasonMode && bucket.matches.length >= want && !(oldestCovered <= sinceMs);

  let seasonShort: string | null = null;
  if (seasonMode) {
    const newest = [...matches].sort((a, b) => henrikMatchTimestamp(b) - henrikMatchTimestamp(a))[0];
    seasonShort = newest?.metadata?.season?.short ?? null;
    if (opts.season !== 'current' && opts.season) seasonShort = opts.season;
  }

  const eligible = matches
    .filter((m) => m.metadata?.is_completed !== false)
    .filter((m) => (m.metadata?.queue?.id ?? '').toLowerCase() === 'competitive')
    .filter((m) => (m.players ?? []).some((p) => p.puuid === account.puuid));
  const inSeason = (m: HenrikMatch): boolean =>
    Boolean(seasonShort && (m.metadata?.season?.short === seasonShort || m.metadata?.season?.id === seasonShort));
  const inWindow = eligible
    .filter((m) => (seasonShort ? inSeason(m) : henrikMatchTimestamp(m) >= sinceMs))
    .sort((a, b) => henrikMatchTimestamp(a) - henrikMatchTimestamp(b));

  // Ventana anterior (deltas de KPIs): misma duración hacia atrás; en temporada,
  // la temporada/acto previo que alcance el archivo.
  const windowMs = opts.days * 24 * 60 * 60 * 1000;
  let prevPool: HenrikMatch[] = [];
  if (seasonShort) {
    const prevSeason = [...eligible]
      .filter((m) => !inSeason(m) && m.metadata?.season?.short)
      .sort((a, b) => henrikMatchTimestamp(b) - henrikMatchTimestamp(a))[0]?.metadata?.season?.short;
    if (prevSeason) prevPool = eligible.filter((m) => m.metadata?.season?.short === prevSeason);
  } else {
    const prevSince = sinceMs - windowMs;
    prevPool = eligible.filter((m) => {
      const t = henrikMatchTimestamp(m);
      return t >= prevSince && t < sinceMs;
    });
  }

  const summaries: MatchSummary[] = [];
  let prevTier: number | null = null;
  let prevElo: number | null = null;

  const mmrHistory = await getHenrikMmrHistory(acctName, acctTag).catch(
    () => [] as Awaited<ReturnType<typeof getHenrikMmrHistory>>,
  );
  const rrByMatch = new Map(mmrHistory.filter((h) => h.match_id).map((h) => [h.match_id!, h]));

  for (const m of inWindow) {
    const me = (m.players ?? []).find((p) => p.puuid === account.puuid)!;
    const myTeam =
      (m.teams ?? []).find((t) => t.team_id != null && t.team_id === me.team_id) ??
      (m.teams ?? [])[0];
    const won = Boolean(myTeam?.won);
    const rds = henrikRoundsPlayed(m);
    const roundsWon0 = myTeam?.rounds?.won ?? 0;
    const roundsLost0 = myTeam?.rounds?.lost ?? Math.max(0, rds - roundsWon0);
    const map = m.metadata?.map?.name ?? '?';
    const agent = me.agent?.name ?? '?';
    const s = me.stats ?? {};

    const hist = rrByMatch.get(m.metadata?.match_id ?? '');
    // El mmr-history es post-partida y por tanto autoritativo: en promociones y
    // deranks me.tier trae el tier PREVIO al partido. Mezclar ese tier con el RR
    // nuevo desplaza 100 pts (ej. D1 previo + 10 RR de D2 = "D1·10" en vez de
    // "D2·10", y al revés oculta los deranks). El tier post-partida + su RR van juntos.
    const tier: number = hist?.tier?.id ?? me.tier?.id ?? prevTier ?? 0;
    const tierChange = prevTier != null ? tier - prevTier : 0;
    prevTier = tier;

    const hs = s.headshots ?? 0;
    const body = s.bodyshots ?? 0;
    const leg = s.legshots ?? 0;
    const shots = hs + body + leg;
    const dmgDealt = s.damage?.dealt ?? 0;
    const roundsWon = roundsWon0;
    const roundsLost = roundsLost0;
    const lengthMin = Math.round((m.metadata?.game_length_in_ms ?? 0) / 60000);

    const elo = hist?.elo ?? null;
    const eloDelta = elo != null && prevElo != null ? elo - prevElo : null;
    if (elo != null) prevElo = elo;

    // Impacto: primeras sangres / primeras muertes (mismo criterio que el arsenal).
    const { firstBloods, firstDeaths } = henrikFirsts(m, account.puuid);

    summaries.push({
      matchId: m.metadata?.match_id ?? '',
      date: new Date(henrikMatchTimestamp(m)).toISOString(),
      timestamp: henrikMatchTimestamp(m),
      map,
      agent,
      won,
      rounds: rds,
      roundsWon,
      roundsLost,
      kills: s.kills ?? 0,
      deaths: s.deaths ?? 0,
      assists: s.assists ?? 0,
      acs: Math.round((s.score ?? 0) / rds),
      adr: Math.round(dmgDealt / rds),
      hsPct: shots ? Math.round((hs / shots) * 1000) / 10 : 0,
      firstBloods,
      firstDeaths,
      score: s.score ?? 0,
      damageDealt: dmgDealt,
      headshots: hs,
      shots,
      tier,
      tierChange,
      tierApprox: hist?.tier?.id == null,
      durationMin: lengthMin,
      rrDelta: hist?.last_change ?? null,
      rr: hist?.rr ?? null,
      elo,
      eloDelta,
      agentIcon: agentIconByName.get(agent.toLowerCase()) ?? null,
      mapIcon: mapIconByName.get(map.toLowerCase()) ?? null,
      agentRole: agentRoleByName.get(agent.toLowerCase()) ?? null,
    });
  }

  summaries.sort((a, b) => b.timestamp - a.timestamp);
  const stats = computeStats(summaries);
  const prevStats = prevPool.length
    ? henrikStatsOf(prevPool, account.puuid, (id) => rrByMatch.get(id)?.last_change ?? null)
    : null;
  const firstMatch = summaries[summaries.length - 1];
  const lastMatch = summaries[0];
  const firstElo = firstMatch?.elo ?? null;
  const lastElo = lastMatch?.elo ?? null;
  const eloTotal = firstElo != null && lastElo != null ? lastElo - firstElo : null;

  // Rango actual: el mmr-history es la fuente autoritativa (el bucket puede
  // no haber sincronizado la última partida y mostrar un rango viejo).
  // Se ordena por fecha y se filtra por temporada: la API no garantiza el
  // orden y el primer elemento podría ser de otro acto o el más viejo.
  const byDateDesc = [...mmrHistory].sort(
    (a, b) => Date.parse(b.date ?? '') - Date.parse(a.date ?? ''),
  );
  const seasonMmr = seasonShort
    ? byDateDesc.filter((h) => h.season?.short === seasonShort || h.season?.id === seasonShort)
    : byDateDesc;
  const latestMmr = seasonMmr[0] ?? null;

  // ---------- Arsenal: uso de armas desde el kill feed ($0 requests) ----------
  const killsBy = new Map<string, number>();
  const deathsBy = new Map<string, number>();
  const fbBy = new Map<string, number>();
  for (const m of inWindow) {
    const seenRounds = new Set<number>();
    for (const k of m.kills ?? []) {
      const w = k.weapon?.name;
      if (!w) continue;
      if (k.killer?.puuid === account.puuid) killsBy.set(w, (killsBy.get(w) ?? 0) + 1);
      if (k.victim?.puuid === account.puuid) deathsBy.set(w, (deathsBy.get(w) ?? 0) + 1);
      // Primera sangre: primer kill del round (mismo patrón que el detalle de partida)
      const r = k.round ?? -1;
      if (!seenRounds.has(r)) {
        seenRounds.add(r);
        if (k.killer?.puuid === account.puuid) fbBy.set(w, (fbBy.get(w) ?? 0) + 1);
      }
    }
  }
  const totalFeedKills = [...killsBy.values()].reduce((a, b) => a + b, 0);
  const totalFirstBloods = [...fbBy.values()].reduce((a, b) => a + b, 0);
  const arsenal: ValArsenal = {
    rows: [...new Set([...killsBy.keys(), ...deathsBy.keys()])]
      .filter((w) => (killsBy.get(w) ?? 0) > 0)
      .map((weapon) => {
        const kills = killsBy.get(weapon) ?? 0;
        const deaths = deathsBy.get(weapon) ?? 0;
        const info = dicts.weapons?.[weapon.toLowerCase()];
        return {
          weapon,
          type: info?.category ?? null,
          icon: info?.icon ?? null,
          kills,
          deaths,
          kd: deaths ? kills / deaths : kills,
          firstBloods: fbBy.get(weapon) ?? 0,
        };
      })
      .sort((a, b) => b.kills - a.kills || b.deaths - a.deaths),
    totalKills: totalFeedKills,
    totalFirstBloods,
  };

  return {
    generatedAt: new Date().toISOString(),
    account: { puuid: account.puuid, gameName: account.name, tagLine: account.tag },
    window: {
      days: opts.days,
      since: new Date(sinceMs).toISOString(),
      fetchedMatches: matches.length,
      consideredMatches: summaries.length,
      archivedMatches: archived.length,
      seasonShort,
      rrTotal: stats.rrTotal,
      rrMissing: stats.rrMissing,
      eloTotal,
      syncedAt: new Date(bucket.updatedAt).toISOString(),
      mmrSyncedAt: (() => {
        const t = cacheUpdatedAt(henrikMmrKey(acctName, acctTag));
        return t != null ? new Date(t).toISOString() : null;
      })(),
      truncated,
    },
    kpis: { ...toStatBlock(stats), losses: stats.losses, fb: stats.fb, fd: stats.fd },
    prev: prevStats ? { ...toStatBlock(prevStats), losses: prevStats.losses, fb: prevStats.fb, fd: prevStats.fd } : null,
    currentTier: latestMmr?.tier?.id ?? lastMatch?.tier ?? 0,
    startTier: firstMatch?.tier ?? 0,
    currentElo: latestMmr?.elo ?? lastMatch?.elo ?? null,
    currentRR: latestMmr?.rr ?? lastMatch?.rr ?? null,
    byAgent: [...groupMatches(summaries, (m) => m.agent)]
      .map(([agent, list]) => ({ agent, ...toStatBlock(computeStats(list)) }))
      .sort((a, b) => b.matches - a.matches),
    byMap: [...groupMatches(summaries, (m) => m.map)]
      .map(([map, list]) => ({ map, ...toStatBlock(computeStats(list)) }))
      .sort((a, b) => b.matches - a.matches),
    matches: summaries,
    arsenal,
  };
}

// ---------- Proveedor Riot oficial ----------

export async function getValSummaryRiot(opts: AggregateOptions): Promise<ValSummary> {
  const profile = requireProfile(opts.playerId, opts.viewer);
  // El proveedor Riot oficial solo conoce la cuenta del .env (VAL_NAME/VAL_TAG).
  if (opts.playerId && (profile.name !== VAL_CONFIG.name() || profile.tag !== VAL_CONFIG.tag())) {
    throw new RiotApiError(
      'NOT_FOUND',
      'Con el proveedor Riot oficial solo se puede consultar la cuenta del .env; configura HENRIK_API_KEY para ver otros perfiles',
    );
  }
  const account = await getAccount();
  const list = await getMatchlist(account.puuid);
  const dicts = await getContent();

  const sinceMs = Date.now() - opts.days * 24 * 60 * 60 * 1000;
  const candidates = (list.history ?? [])
    .filter((h) => h.gameStartTimeMillis >= sinceMs)
    .sort((a, b) => b.gameStartTimeMillis - a.gameStartTimeMillis);

  const cap = opts.maxFetch ?? 80;
  const toFetch = candidates.slice(0, cap);

  const CHUNK = 5;
  const results: { entry: MatchListEntry; match: ValMatch | null; err: unknown }[] = [];
  for (let i = 0; i < toFetch.length; i += CHUNK) {
    const chunk = toFetch.slice(i, i + CHUNK);
    const settled = await Promise.all(
      chunk.map(async (entry) => {
        try {
          return { entry, match: await getMatch(entry.matchId), err: null as unknown };
        } catch (err) {
          return { entry, match: null as ValMatch | null, err: err as unknown };
        }
      }),
    );
    results.push(...settled);
  }

  const fatalErr = results.find((r) => r.err instanceof RiotApiError)?.err as RiotApiError | undefined;
  if (fatalErr && results.every((r) => r.match === null)) throw fatalErr;

  const summaries: MatchSummary[] = [];

  let prevTier: number | null = null;

  const playable = results
    .filter((r): r is { entry: MatchListEntry; match: ValMatch; err: unknown } =>
      Boolean(r.match?.matchInfo?.isCompleted && r.match.players?.some((p) => p.puuid === account.puuid)))
    .filter((r) => (r.match.matchInfo.queueID ?? '') === 'competitive')
    .sort((a, b) => a.entry.gameStartTimeMillis - b.entry.gameStartTimeMillis);

  for (const { entry, match } of playable) {
    const me = match.players.find((p) => p.puuid === account.puuid)!;
    const myTeam = match.teams.find((t) => t.teamId === me.teamId);
    const won = Boolean(myTeam?.won);
    const mapEntry = dicts.maps[(match.matchInfo.mapId ?? '').toLowerCase()];
    const map = mapDisplayName(match.matchInfo.mapId, dicts);
    const agentEntry = dicts.agents[(me.characterId ?? '').toLowerCase()];
    const agent = agentEntry?.name ?? me.characterId ?? '?';
    const agentIcon = agentEntry?.icon ?? null;
    const mapIcon = mapEntry?.icon ?? null;

    const tier: number = me.competitiveTier ?? prevTier ?? 0;
    const tierChange = prevTier != null ? tier - prevTier : 0;
    prevTier = tier;

    const s = me.stats ?? {};
    const dmgDealt = (me.damage ?? []).reduce((acc, d) => acc + (d.damage ?? 0), 0);
    const hs = (me.damage ?? []).reduce((a, d) => a + (d.headshots ?? 0), 0);
    const body = (me.damage ?? []).reduce((a, d) => a + (d.bodyshots ?? 0), 0);
    const leg = (me.damage ?? []).reduce((a, d) => a + (d.legshots ?? 0), 0);
    const shots = hs + body + leg;
    const rounds = s.roundsPlayed ?? 1;
    const lengthMin = Math.round((match.matchInfo.gameLengthMillis ?? 0) / 60000);

    summaries.push({
      matchId: entry.matchId,
      date: new Date(entry.gameStartTimeMillis).toISOString(),
      timestamp: entry.gameStartTimeMillis,
      map,
      agent,
      won,
      rounds,
      roundsWon: myTeam?.roundsWon ?? 0,
      roundsLost: Math.max(0, rounds - (myTeam?.roundsWon ?? 0)),
      kills: s.kills ?? 0,
      deaths: s.deaths ?? 0,
      assists: s.assists ?? 0,
      acs: rounds ? Math.round((s.score ?? 0) / rounds) : 0,
      adr: rounds ? Math.round(dmgDealt / rounds) : 0,
      hsPct: shots ? Math.round((hs / shots) * 1000) / 10 : 0,
      score: s.score ?? 0,
      damageDealt: dmgDealt,
      headshots: hs,
      shots,
      tier,
      tierChange,
      durationMin: lengthMin,
      agentIcon,
      mapIcon,
      agentRole: agentEntry?.role ?? null,
    });
  }

  summaries.sort((a, b) => b.timestamp - a.timestamp);

  const stats = computeStats(summaries);
  const firstMatch = summaries[summaries.length - 1];
  const lastMatch = summaries[0];

  return {
    generatedAt: new Date().toISOString(),
    account,
    window: {
      days: opts.days,
      since: new Date(sinceMs).toISOString(),
      fetchedMatches: results.length,
      consideredMatches: summaries.length,
    },
    kpis: { ...toStatBlock(stats), losses: stats.losses },
    prev: null,
    currentTier: lastMatch?.tier ?? 0,
    startTier: firstMatch?.tier ?? 0,
    byAgent: [...groupMatches(summaries, (m) => m.agent)]
      .map(([agent, list]) => ({ agent, ...toStatBlock(computeStats(list)) }))
      .sort((a, b) => b.matches - a.matches),
    byMap: [...groupMatches(summaries, (m) => m.map)]
      .map(([map, list]) => ({ map, ...toStatBlock(computeStats(list)) }))
      .sort((a, b) => b.matches - a.matches),
    matches: summaries,
  };
}
