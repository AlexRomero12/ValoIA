import { env } from './env';
import { cached, cacheSet } from './cache';
import { getArchiveMatches } from './archive';
import {
  HENRIK_CONFIG,
  getHenrikAccount,
  getMatchesBucket,
  getHenrikMmrHistory,
  henrikMatchId,
  henrikMatchTimestamp,
  henrikRoundsPlayed,
  BUCKET_LIMIT,
  type HenrikMatch,
  type HenrikMatchPlayer,
} from './henrik';
import { resolvePlayer } from './team';

export const VAL_CONFIG = {
  name: () => env('VAL_NAME', 'AlexRomero12'),
  tag: () => env('VAL_TAG', 'LAN'),
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

interface PlayerStats {
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
  stats?: PlayerStats;
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

// ---------- Ranks ----------

const TIER_NAMES: Record<number, string> = {};
{
  const tiers = [
    ['Unrated', 0], ['Unrated', 1], ['Unrated', 2],
    ['Iron 1', 3], ['Iron 2', 4], ['Iron 3', 5],
    ['Bronze 1', 6], ['Bronze 2', 7], ['Bronze 3', 8],
    ['Silver 1', 9], ['Silver 2', 10], ['Silver 3', 11],
    ['Gold 1', 12], ['Gold 2', 13], ['Gold 3', 14],
    ['Platinum 1', 15], ['Platinum 2', 16], ['Platinum 3', 17],
    ['Diamond 1', 18], ['Diamond 2', 19], ['Diamond 3', 20],
    ['Ascendant 1', 21], ['Ascendant 2', 22], ['Ascendant 3', 23],
    ['Immortal 1', 24], ['Immortal 2', 25], ['Immortal 3', 26],
    ['Radiant', 27],
  ] as const;
  for (const [name, n] of tiers) TIER_NAMES[n] = name;
}
export function tierName(tier: number | null | undefined): string {
  if (tier == null) return '—';
  if (TIER_NAMES[tier]) return TIER_NAMES[tier];
  if (tier > 27) return `Immortal ${tier - 23}`;
  return `Tier ${tier}`;
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
  score?: number;
  damageDealt?: number;
  headshots?: number;
  shots?: number;
  tier: number;
  tierChange: number;
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

interface GroupStat {
  matches: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  score: number;
  rounds: number;
  damage: number;
  headshots: number;
  bodyshots: number;
  legshots: number;
}

function newGroup(): GroupStat {
  return { matches: 0, wins: 0, kills: 0, deaths: 0, assists: 0, score: 0, rounds: 0, damage: 0, headshots: 0, bodyshots: 0, legshots: 0 };
}

function addPlayer(g: GroupStat, p: ValPlayer, won: boolean): void {
  const s = p.stats ?? {};
  g.matches += 1;
  if (won) g.wins += 1;
  g.kills += s.kills ?? 0;
  g.deaths += s.deaths ?? 0;
  g.assists += s.assists ?? 0;
  g.score += s.score ?? 0;
  g.rounds += s.roundsPlayed ?? 0;
  for (const d of p.damage ?? []) {
    g.damage += d.damage ?? 0;
    g.headshots += d.headshots ?? 0;
    g.bodyshots += d.bodyshots ?? 0;
    g.legshots += d.legshots ?? 0;
  }
}

function finishGroup(g: GroupStat) {
  const shotsTotal = g.headshots + g.bodyshots + g.legshots;
  return {
    matches: g.matches,
    wins: g.wins,
    wr: g.matches ? (g.wins / g.matches) * 100 : 0,
    kd: g.deaths ? g.kills / g.deaths : g.kills > 0 ? g.kills : 0,
    acs: g.rounds ? g.score / g.rounds : 0,
    adr: g.rounds ? g.damage / g.rounds : 0,
    hsPct: shotsTotal ? (g.headshots / shotsTotal) * 100 : 0,
  };
}

export interface ValSummary {
  generatedAt: string;
  account: ValAccount;
  window: { days: number; since: string; fetchedMatches: number; consideredMatches: number; archivedMatches?: number; seasonShort?: string | null; rrTotal?: number | null; eloTotal?: number | null; syncedAt?: string | null };
  kpis: ReturnType<typeof finishGroup> & { wins: number; losses: number };
  currentTier: number;
  startTier: number;
  currentElo?: number | null;
  currentRR?: number | null;
  byAgent: (ReturnType<typeof finishGroup> & { agent: string })[];
  byMap: (ReturnType<typeof finishGroup> & { map: string })[];
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
  /** id del miembro del equipo (lib/team.ts); default = alex */
  playerId?: string;
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

const henrikTimestamp = henrikMatchTimestamp;

async function getValSummaryHenrik(opts: AggregateOptions): Promise<ValSummary> {
  const member = resolvePlayer(opts.playerId);
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

  let seasonShort: string | null = null;
  if (seasonMode) {
    const newest = [...matches].sort((a, b) => henrikMatchTimestamp(b) - henrikMatchTimestamp(a))[0];
    seasonShort = newest?.metadata?.season?.short ?? null;
    if (opts.season !== 'current' && opts.season) seasonShort = opts.season;
  }

  const inWindow = matches
    .filter((m) => (seasonShort ? true : henrikMatchTimestamp(m) >= sinceMs))
    .filter((m) => m.metadata?.is_completed !== false)
    .filter((m) => {
      const q = (m.metadata?.queue?.id ?? '').toLowerCase();
      return q === 'competitive';
    })
    .filter((m) => (seasonShort ? m.metadata?.season?.short === seasonShort || m.metadata?.season?.id === seasonShort : true))
    .filter((m) => (m.players ?? []).some((p) => p.puuid === account.puuid))
    .sort((a, b) => henrikMatchTimestamp(a) - henrikMatchTimestamp(b));

  interface Acc {
    matches: number;
    wins: number;
    kills: number;
    deaths: number;
    assists: number;
    score: number;
    rounds: number;
    damage: number;
    headshots: number;
    bodyshots: number;
    legshots: number;
  }
  const newAcc = (): Acc => ({ matches: 0, wins: 0, kills: 0, deaths: 0, assists: 0, score: 0, rounds: 0, damage: 0, headshots: 0, bodyshots: 0, legshots: 0 });
  const add = (a: Acc, me: HenrikMatchPlayer, won: boolean, rounds: number): void => {
    const s = me.stats ?? {};
    a.matches += 1;
    if (won) a.wins += 1;
    a.kills += s.kills ?? 0;
    a.deaths += s.deaths ?? 0;
    a.assists += s.assists ?? 0;
    a.score += s.score ?? 0;
    a.rounds += rounds;
    a.damage += s.damage?.dealt ?? 0;
    a.headshots += s.headshots ?? 0;
    a.bodyshots += s.bodyshots ?? 0;
    a.legshots += s.legshots ?? 0;
  };
  const finish = (a: Acc) => {
    const shots = a.headshots + a.bodyshots + a.legshots;
    return {
      matches: a.matches,
      wins: a.wins,
      wr: a.matches ? (a.wins / a.matches) * 100 : 0,
      kd: a.deaths ? a.kills / a.deaths : a.kills > 0 ? a.kills : 0,
      acs: a.rounds ? a.score / a.rounds : 0,
      adr: a.rounds ? a.damage / a.rounds : 0,
      hsPct: shots ? (a.headshots / shots) * 100 : 0,
    };
  };

  const group = newAcc();
  const agentGroups = new Map<string, Acc>();
  const mapGroups = new Map<string, Acc>();
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
    const map = m.metadata?.map?.name ?? '?';
    const agent = me.agent?.name ?? '?';
    const s = me.stats ?? {};
    const rds = henrikRoundsPlayed(m);

    add(group, me, won, rds);
    if (!agentGroups.has(agent)) agentGroups.set(agent, newAcc());
    add(agentGroups.get(agent)!, me, won, rds);
    if (!mapGroups.has(map)) mapGroups.set(map, newAcc());
    add(mapGroups.get(map)!, me, won, rds);

    const tier: number = me.tier?.id ?? prevTier ?? 0;
    const tierChange = prevTier != null ? tier - prevTier : 0;
    prevTier = tier;

    const hs = s.headshots ?? 0;
    const body = s.bodyshots ?? 0;
    const leg = s.legshots ?? 0;
    const shots = hs + body + leg;
    const dmgDealt = s.damage?.dealt ?? 0;
    const roundsWon = myTeam?.rounds?.won ?? 0;
    const roundsLost = myTeam?.rounds?.lost ?? Math.max(0, rds - roundsWon);
    const lengthMin = Math.round((m.metadata?.game_length_in_ms ?? 0) / 60000);

    const hist = rrByMatch.get(m.metadata?.match_id ?? '');
    const elo = hist?.elo ?? null;
    const eloDelta = elo != null && prevElo != null ? elo - prevElo : null;
    if (elo != null) prevElo = elo;

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
      score: s.score ?? 0,
      damageDealt: dmgDealt,
      headshots: hs,
      shots,
      tier,
      tierChange,
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
  const kpis = finish(group);
  const firstMatch = summaries[summaries.length - 1];
  const lastMatch = summaries[0];
  const rrTotal = summaries.reduce((acc, m) => acc + (m.rrDelta ?? 0), 0);
  const firstElo = firstMatch?.elo ?? null;
  const lastElo = lastMatch?.elo ?? null;
  const eloTotal = firstElo != null && lastElo != null ? lastElo - firstElo : null;

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
      rrTotal,
      eloTotal,
      syncedAt: new Date(bucket.updatedAt).toISOString(),
    },
    kpis: { ...kpis, wins: group.wins, losses: group.matches - group.wins },
    currentTier: lastMatch?.tier ?? 0,
    startTier: firstMatch?.tier ?? 0,
    currentElo: lastMatch?.elo ?? null,
    currentRR: lastMatch?.rr ?? null,
    byAgent: [...agentGroups.entries()]
      .map(([agent, g]) => ({ agent, ...finish(g) }))
      .sort((a, b) => b.matches - a.matches),
    byMap: [...mapGroups.entries()]
      .map(([map, g]) => ({ map, ...finish(g) }))
      .sort((a, b) => b.matches - a.matches),
    matches: summaries,
    arsenal,
  };
}

// ---------- Proveedor Riot oficial ----------

export async function getValSummaryRiot(opts: AggregateOptions): Promise<ValSummary> {
  if (opts.playerId && resolvePlayer(opts.playerId).id !== 'alex') {
    throw new RiotApiError(
      'NOT_FOUND',
      'Perfiles del equipo solo disponibles con proveedor Henrik (la API oficial de Riot no da match history con keys de desarrollo)',
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

  const group = newGroup();
  const agentGroups = new Map<string, GroupStat>();
  const mapGroups = new Map<string, GroupStat>();
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

    addPlayer(group, me, won);
    if (!agentGroups.has(agent)) agentGroups.set(agent, newGroup());
    addPlayer(agentGroups.get(agent)!, me, won);
    if (!mapGroups.has(map)) mapGroups.set(map, newGroup());
    addPlayer(mapGroups.get(map)!, me, won);

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

  const kpis = finishGroup(group);
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
    kpis: {
      ...kpis,
      wins: group.wins,
      losses: group.matches - group.wins,
    },
    currentTier: lastMatch?.tier ?? 0,
    startTier: firstMatch?.tier ?? 0,
    byAgent: [...agentGroups.entries()]
      .map(([agent, g]) => ({ agent, ...finishGroup(g) }))
      .sort((a, b) => b.matches - a.matches),
    byMap: [...mapGroups.entries()]
      .map(([map, g]) => ({ map, ...finishGroup(g) }))
      .sort((a, b) => b.matches - a.matches),
    matches: summaries,
  };
}
