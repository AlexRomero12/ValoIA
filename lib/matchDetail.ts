import { cacheSet, findCachedValues } from './cache';
import { getArchiveMatchById } from './archive';
import { getContent } from './riot/content';
import { getCachedMatches } from './riot/matches';
import { listViewableProfilesFor, type ProfileViewer } from './profiles';
import { memberAccounts } from './profileTypes';
import { findMePlayer, matchRoundsPlayed, matchTimestamp, type MatchRecord } from './providers/types';

export interface DetailPlayer {
  name: string;
  tag: string;
  agentName: string;
  agentIcon: string | null;
  tier: number;
  teamId: string | null;
  isMe: boolean;
  kills: number;
  deaths: number;
  assists: number;
  acs: number;
  adr: number;
  hsPct: number;
  dmgOut: number;
  dmgIn: number;
  creditsSpent: number;
  loadoutAvg: number;
}

export interface RoundCell {
  n: number;
  won: boolean;
  result: string;
  plantSite?: string;
  plantBy?: string;
  defuseBy?: string;
}

export interface MatchDetail {
  matchId: string;
  meta: {
    map: string;
    mapIcon: string | null;
    date: string;
    durationMin: number;
    myAgent: string;
    myAgentIcon: string | null;
    won: boolean;
    roundsWon: number;
    roundsLost: number;
  };
  players: DetailPlayer[];
  rounds: RoundCell[];
  combat: {
    firstBloods: number;
    firstDeaths: number;
    topKillers: { name: string; times: number; weapon: string }[];
    otherKillers: number;
    otherDeaths: number;
  };
}

const DETAIL_TTL = 7 * 24 * 60 * 60 * 1000;

/**
 * Detalle de una partida desde el archivo acumulativo o el bucket cacheado
 * ($0 requests). El visor decide qué perfiles son accesibles (propios o
 * públicos con opt-in).
 */
export async function getMatchDetail(matchId: string, playerId?: string | null, viewer?: ProfileViewer): Promise<MatchDetail> {
  const candidates = viewer ? listViewableProfilesFor(viewer) : [];
  if (candidates.length === 0) {
    throw Object.assign(new Error('No hay perfil configurado'), { code: 'NOT_CACHED' });
  }
  const preferred = candidates.find((m) => m.id === playerId) ?? candidates[0];
  // v4: detalle de la rama Riot (sin RR, sin temporada).
  const cacheKey = `val:detail:v4:${preferred.id}:${matchId}`;
  const cachedDto = findCachedValues<MatchDetail>(cacheKey)[0];
  if (cachedDto) return cachedDto;

  let match: MatchRecord | undefined;
  let meAccount: { name: string; tag: string } | undefined;
  outer: for (const acct of memberAccounts(preferred)) {
    // 1) Archivo acumulativo: cubre partidas fuera del bucket de 40 ($0 requests)
    const archived = getArchiveMatchById(acct.name, acct.tag, matchId);
    if (archived) {
      match = archived;
      meAccount = acct;
      break outer;
    }
    // 2) Bucket cacheado (ventana fresca)
    const found = getCachedMatches(acct.name, acct.tag).find((m) => m.metadata?.match_id === matchId);
    if (found) {
      match = found;
      meAccount = acct;
      break outer;
    }
  }
  if (!match) {
    throw Object.assign(
      new Error('Partida fuera del cache — pulsa Actualizar para recargarla desde el bucket sincronizado.'),
      { code: 'NOT_CACHED' },
    );
  }

  const dicts = await getContent();
  const agentIconByName = new Map(Object.values(dicts.agents).map((e) => [e.name.toLowerCase(), e.icon]));
  const mapIconByName = new Map(Object.values(dicts.maps).map((e) => [e.name.toLowerCase(), e.icon]));

  const me = findMePlayer(match, undefined, meAccount?.name, meAccount?.tag);
  const myTeamId = me?.team_id ?? null;
  const myTeam = (match.teams ?? []).find((t) => t.team_id != null && t.team_id === myTeamId) ?? (match.teams ?? [])[0];

  const players: DetailPlayer[] = (match.players ?? []).map((p) => {
    const st = p.stats ?? {};
    const rounds = Math.max(1, matchRoundsPlayed(match));
    const shots = (st.headshots ?? 0) + (st.bodyshots ?? 0) + (st.legshots ?? 0);
    return {
      name: p.name ?? '?',
      tag: p.tag ?? '',
      agentName: p.agent?.name ?? '?',
      agentIcon: agentIconByName.get((p.agent?.name ?? '').toLowerCase()) ?? null,
      tier: p.tier?.id ?? 0,
      teamId: p.team_id ?? null,
      isMe: p.puuid === me?.puuid || (!!me && p.name === me.name && p.tag === me.tag),
      kills: s2(st.kills),
      deaths: s2(st.deaths),
      assists: s2(st.assists),
      acs: Math.round(s2(st.score) / rounds),
      adr: Math.round(s2(st.damage?.dealt) / rounds),
      hsPct: shots ? round1((s2(st.headshots) / shots) * 100) : 0,
      dmgOut: s2(st.damage?.dealt),
      dmgIn: s2(st.damage?.received),
      creditsSpent: s2(p.economy?.spent?.overall),
      loadoutAvg: Math.round(s2(p.economy?.loadout_value?.average)),
    };
  });
  players.sort((a, b) => b.acs - a.acs);

  const myPuuid = me?.puuid;
  let fb = 0;
  let fd = 0;
  const seenRounds = new Set<number>();
  const killerCount = new Map<string, { times: number; weapon: string }>();
  for (const k of match.kills ?? []) {
    const r = k.round ?? -1;
    if (!seenRounds.has(r)) {
      seenRounds.add(r);
      if (k.killer?.puuid === myPuuid) fb++;
      if (k.victim?.puuid === myPuuid) fd++;
    }
    if (k.victim?.puuid === myPuuid && k.killer?.name) {
      const prev = killerCount.get(k.killer.name);
      killerCount.set(k.killer.name, {
        times: (prev?.times ?? 0) + 1,
        weapon: k.weapon?.name ?? prev?.weapon ?? '?',
      });
    }
  }
  const ranked = [...killerCount.entries()]
    .map(([name, v]) => ({ name, times: v.times, weapon: v.weapon }))
    .sort((a, b) => b.times - a.times);
  const topKillers = ranked.slice(0, 3);
  const otherKillers = ranked.length - topKillers.length;
  const otherDeaths = ranked.slice(3).reduce((a, k) => a + k.times, 0);

  const rounds: RoundCell[] = (match.rounds ?? []).map((r, idx) => ({
    n: (r.id ?? idx) + 1,
    won: r.winning_team != null ? r.winning_team === myTeamId : Boolean(myTeam?.won),
    result: r.result ?? '',
    plantSite: r.plant?.site,
    plantBy: r.plant?.player?.name,
    defuseBy: r.defuse?.player?.name,
  }));

  const dto: MatchDetail = {
    matchId,
    meta: {
      map: match.metadata?.map?.name ?? '?',
      mapIcon: mapIconByName.get((match.metadata?.map?.name ?? '').toLowerCase()) ?? null,
      date: new Date(matchTimestamp(match)).toISOString(),
      durationMin: Math.round((match.metadata?.game_length_in_ms ?? 0) / 60000),
      myAgent: me?.agent?.name ?? '?',
      myAgentIcon: agentIconByName.get((me?.agent?.name ?? '').toLowerCase()) ?? null,
      won: Boolean(myTeam?.won),
      roundsWon: myTeam?.rounds?.won ?? 0,
      roundsLost: myTeam?.rounds?.lost ?? 0,
    },
    players,
    rounds,
    combat: { firstBloods: fb, firstDeaths: fd, topKillers, otherKillers, otherDeaths },
  };

  cacheSet(cacheKey, dto, DETAIL_TTL);
  return dto;
}

function s2(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
