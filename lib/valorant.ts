import { getArchiveMatches } from './archive';
import { BUCKET_LIMIT, getMatchesBucket, type MatchesBucket } from './riot/matches';
import { resolveAccount } from './riot/account';
import { RIOT_CONFIG, RiotApiError } from './riot/client';
import { getContent } from './riot/content';
import { findMePlayer, matchIdOf, matchRoundsPlayed, matchTimestamp, type MatchRecord } from './providers/types';
import { requireProfile, type ProfileViewer } from './profiles';
import { computeStats, groupMatches, toStatBlock, type PlayerStats, type StatBlock } from './stats';
import type { ValAccount } from './types';

export { getContent, mapDisplayName } from './riot/content';
export type { ContentDicts, ContentEntry } from './riot/content';
export { getAccount, resolveAccount, getActiveShard } from './riot/account';
export { RIOT_CONFIG, RiotApiError } from './riot/client';
export type { MatchesBucket } from './riot/matches';

/**
 * Agregación del dashboard con la API oficial de Riot (rama dev + mock).
 *
 * Capacidades reales (verificadas con dev key):
 *  - ACCOUNT-V1, VAL-CONTENT-V1, VAL-STATUS-V1: en vivo.
 *  - VAL-MATCH-V1: 403 en dev → se sirve del mock (mismos DTOs que producción).
 *
 * Lo que la API oficial no expone NO existe en esta rama: sin RR/MMR, sin
 * temporadas (los acts no traen fechas), sin nivel de cuenta, sin paginación
 * de historial.
 */

export const VAL_CONFIG = {
  name: () => RIOT_CONFIG.name(),
  tag: () => RIOT_CONFIG.tag(),
  shard: () => RIOT_CONFIG.shard(),
  cluster: () => RIOT_CONFIG.cluster(),
  apiKey: () => RIOT_CONFIG.apiKey(),
};

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
  /** Primeras sangres del jugador (primer kill del round). */
  firstBloods?: number;
  /** Primeras muertes del jugador (primera muerte del round). */
  firstDeaths?: number;
  score?: number;
  damageDealt?: number;
  headshots?: number;
  shots?: number;
  /** Tier reportado por la partida (API oficial). */
  tier: number;
  tierChange: number;
  durationMin: number;
  agentIcon?: string | null;
  mapIcon?: string | null;
  /** Rol del agente, cuando el catálogo de contenido lo tiene */
  agentRole?: string | null;
}

export type ValKpisBlock = StatBlock & { losses: number; fb?: number; fd?: number };

export interface ValSummary {
  generatedAt: string;
  account: ValAccount;
  window: {
    days: number;
    since: string;
    fetchedMatches: number;
    consideredMatches: number;
    archivedMatches?: number;
    /** Origen de los datos de partidas: mock (dev) o live (key productiva) */
    source: 'mock' | 'live';
    /** Fecha ISO de la última sincronización del bucket */
    syncedAt?: string | null;
    /** La ventana puede estar recortada (bucket al tope sin cobertura total) */
    truncated?: boolean;
  };
  kpis: ValKpisBlock;
  /** Ventana anterior de igual duración (deltas de KPIs); null si no hay datos. */
  prev?: ValKpisBlock | null;
  currentTier: number;
  startTier: number;
  byAgent: (StatBlock & { agent: string })[];
  byMap: (StatBlock & { map: string })[];
  matches: MatchSummary[];
  /** Uso de armas derivado del kill feed de las partidas en ventana */
  arsenal?: ValArsenal;
}

export interface AggregateOptions {
  days: number;
  maxFetch?: number;
  /** id del perfil; default = primer perfil visible para el visor */
  playerId?: string;
  /** Quién consulta (modo público: perfiles propios + públicos con opt-in) */
  viewer?: ProfileViewer;
  /** Cuenta específica de un miembro multi-cuenta; default = su cuenta principal */
  accountName?: string;
  accountTag?: string;
}

export type Provider = 'riot';

export function getProvider(): Provider | null {
  return RIOT_CONFIG.apiKey() ? 'riot' : null;
}

/** Primeras sangres/muertes del jugador desde el kill feed de una partida. */
function firstsOf(m: MatchRecord, puuid: string | undefined, name: string | undefined, tag: string | undefined): { firstBloods: number; firstDeaths: number } {
  const me = findMePlayer(m, puuid, name, tag);
  const myPuuid = me?.puuid;
  if (!myPuuid) return { firstBloods: 0, firstDeaths: 0 };
  const seenRounds = new Set<number>();
  let firstBloods = 0;
  let firstDeaths = 0;
  for (const k of m.kills ?? []) {
    const round = k.round ?? -1;
    if (seenRounds.has(round)) continue;
    seenRounds.add(round);
    if (k.killer?.puuid === myPuuid) firstBloods += 1;
    if (k.victim?.puuid === myPuuid) firstDeaths += 1;
  }
  return { firstBloods, firstDeaths };
}

/** Stats agregadas de una lista de partidas sin construir MatchSummary (ventana previa). */
function statsOf(
  list: MatchRecord[],
  puuid: string | undefined,
  name: string,
  tag: string,
): PlayerStats {
  return computeStats(
    list.map((m) => {
      const me = findMePlayer(m, puuid, name, tag);
      const myTeam =
        (m.teams ?? []).find((t) => t.team_id != null && t.team_id === me?.team_id) ??
        (m.teams ?? [])[0];
      const rds = matchRoundsPlayed(m);
      const s = me?.stats ?? {};
      const roundsWon = myTeam?.rounds?.won ?? 0;
      const hs = s.headshots ?? 0;
      const body = s.bodyshots ?? 0;
      const leg = s.legshots ?? 0;
      const shots = hs + body + leg;
      const dmgDealt = s.damage?.dealt ?? 0;
      const { firstBloods, firstDeaths } = firstsOf(m, puuid, name, tag);
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
        firstBloods,
        firstDeaths,
      };
    }),
  );
}

export async function getValSummary(opts: AggregateOptions): Promise<ValSummary> {
  const member = requireProfile(opts.playerId, opts.viewer);
  const acctName = opts.accountName ?? member.name;
  const acctTag = opts.accountTag ?? member.tag;
  const account = await resolveAccount(acctName, acctTag);
  const dicts = await getContent();
  const agentIconByName = new Map(Object.values(dicts.agents).map((e) => [e.name.toLowerCase(), e.icon]));
  const agentRoleByName = new Map(Object.values(dicts.agents).map((e) => [e.name.toLowerCase(), e.role ?? null]));
  const mapIconByName = new Map(Object.values(dicts.maps).map((e) => [e.name.toLowerCase(), e.icon]));

  const want = Math.min(opts.maxFetch ?? 20, BUCKET_LIMIT);
  if (!account.puuid) throw new RiotApiError('NOT_FOUND', `Cuenta ${acctName}#${acctTag} sin puuid`);
  const bucket: MatchesBucket = await getMatchesBucket(acctName, acctTag, account.puuid, want);

  // Archivo acumulativo: une el bucket fresco con lo archivado históricamente.
  const archived = getArchiveMatches(acctName, acctTag);
  const seenIds = new Set<string>();
  const matches: MatchRecord[] = [];
  for (const m of [...bucket.matches, ...archived]) {
    const id = matchIdOf(m);
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);
    matches.push(m);
  }

  const sinceMs = Date.now() - opts.days * 24 * 60 * 60 * 1000;
  const oldestCovered = [...bucket.matches, ...archived]
    .map(matchTimestamp)
    .filter((t) => t > 0)
    .reduce((a, b) => Math.min(a, b), Infinity);
  const truncated = bucket.matches.length >= want && !(oldestCovered <= sinceMs);

  const eligible = matches
    .filter((m) => m.metadata?.is_completed !== false)
    .filter((m) => (m.metadata?.queue?.id ?? '').toLowerCase() === 'competitive')
    .filter((m) => Boolean(findMePlayer(m, account.puuid, account.gameName, account.tagLine)));
  const inWindow = eligible
    .filter((m) => matchTimestamp(m) >= sinceMs)
    .sort((a, b) => matchTimestamp(a) - matchTimestamp(b));

  // Ventana anterior (deltas de KPIs): misma duración hacia atrás.
  const windowMs = opts.days * 24 * 60 * 60 * 1000;
  const prevSince = sinceMs - windowMs;
  const prevPool = eligible.filter((m) => {
    const t = matchTimestamp(m);
    return t >= prevSince && t < sinceMs;
  });

  const summaries: MatchSummary[] = [];
  let prevTier: number | null = null;

  for (const m of inWindow) {
    const me = findMePlayer(m, account.puuid, account.gameName, account.tagLine)!;
    const myTeam =
      (m.teams ?? []).find((t) => t.team_id != null && t.team_id === me.team_id) ??
      (m.teams ?? [])[0];
    const won = Boolean(myTeam?.won);
    const rds = matchRoundsPlayed(m);
    const roundsWon = myTeam?.rounds?.won ?? 0;
    const roundsLost = myTeam?.rounds?.lost ?? Math.max(0, rds - roundsWon);
    const map = m.metadata?.map?.name ?? '?';
    const agent = me.agent?.name ?? '?';
    const s = me.stats ?? {};

    const tier: number = me.tier?.id ?? prevTier ?? 0;
    const tierChange = prevTier != null ? tier - prevTier : 0;
    prevTier = tier;

    const hs = s.headshots ?? 0;
    const body = s.bodyshots ?? 0;
    const leg = s.legshots ?? 0;
    const shots = hs + body + leg;
    const dmgDealt = s.damage?.dealt ?? 0;
    const lengthMin = Math.round((m.metadata?.game_length_in_ms ?? 0) / 60000);
    const { firstBloods, firstDeaths } = firstsOf(m, account.puuid, account.gameName, account.tagLine);

    summaries.push({
      matchId: m.metadata?.match_id ?? '',
      date: new Date(matchTimestamp(m)).toISOString(),
      timestamp: matchTimestamp(m),
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
      durationMin: lengthMin,
      agentIcon: agentIconByName.get(agent.toLowerCase()) ?? null,
      mapIcon: mapIconByName.get(map.toLowerCase()) ?? null,
      agentRole: agentRoleByName.get(agent.toLowerCase()) ?? null,
    });
  }

  summaries.sort((a, b) => b.timestamp - a.timestamp);
  const stats = computeStats(summaries);
  const prevStats = prevPool.length ? statsOf(prevPool, account.puuid, account.gameName, account.tagLine) : null;
  const firstMatch = summaries[summaries.length - 1];
  const lastMatch = summaries[0];

  // ---------- Arsenal: uso de armas desde el kill feed ($0 requests) ----------
  const killsBy = new Map<string, number>();
  const deathsBy = new Map<string, number>();
  const fbBy = new Map<string, number>();
  for (const m of inWindow) {
    const me = findMePlayer(m, account.puuid, account.gameName, account.tagLine);
    const myPuuid = me?.puuid;
    const seenRounds = new Set<number>();
    for (const k of m.kills ?? []) {
      const w = k.weapon?.name;
      if (!w) continue;
      if (k.killer?.puuid === myPuuid) killsBy.set(w, (killsBy.get(w) ?? 0) + 1);
      if (k.victim?.puuid === myPuuid) deathsBy.set(w, (deathsBy.get(w) ?? 0) + 1);
      // Primera sangre: primer kill del round (mismo patrón que el detalle de partida)
      const r = k.round ?? -1;
      if (!seenRounds.has(r)) {
        seenRounds.add(r);
        if (k.killer?.puuid === myPuuid) fbBy.set(w, (fbBy.get(w) ?? 0) + 1);
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
    account: { puuid: account.puuid, gameName: account.gameName, tagLine: account.tagLine },
    window: {
      days: opts.days,
      since: new Date(sinceMs).toISOString(),
      fetchedMatches: matches.length,
      consideredMatches: summaries.length,
      archivedMatches: archived.length,
      source: bucket.source,
      syncedAt: new Date(bucket.updatedAt).toISOString(),
      truncated,
    },
    kpis: { ...toStatBlock(stats), losses: stats.losses, fb: stats.fb, fd: stats.fd },
    prev: prevStats ? { ...toStatBlock(prevStats), losses: prevStats.losses, fb: prevStats.fb, fd: prevStats.fd } : null,
    currentTier: lastMatch?.tier ?? 0,
    startTier: firstMatch?.tier ?? 0,
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
