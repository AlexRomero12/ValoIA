import { getContent } from './valorant';
import { findCachedValues, cacheSet } from './cache';
import { getArchiveMatchById } from './archive';
import { getHenrikAccount } from './henrik';
import { getTeam, resolvePlayer } from './team';
import type { HenrikMatch } from './henrik';

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
    seasonShort: string;
    myAgent: string;
    myAgentIcon: string | null;
    won: boolean;
    roundsWon: number;
    roundsLost: number;
    rrDelta: number | null;
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

export async function getMatchDetail(matchId: string, playerId?: string | null): Promise<MatchDetail> {
  const cacheKey = `val:detail:v2:${resolvePlayer(playerId).id}:${matchId}`;
  const cachedDto = await Promise.resolve(findCachedValues<MatchDetail>(cacheKey)[0]);
  if (cachedDto) return cachedDto;

  const preferred = resolvePlayer(playerId);
  const orderedMembers = [
    preferred,
    ...getTeam().filter((m) => m.id !== preferred.id),
  ];

  let match: HenrikMatch | undefined;
  let ownerPuuid = '';
  for (const member of orderedMembers) {
    const acc = await getHenrikAccount(member.name, member.tag).catch(() => null);
    if (!acc?.puuid) continue;
    // 1) Archivo acumulativo: cubre partidas fuera del bucket de 40 ($0 requests)
    const archived = getArchiveMatchById(member.name, member.tag, matchId);
    if (archived) {
      match = archived;
      ownerPuuid = acc.puuid;
      break;
    }
    // 2) Buckets cacheados (ventana fresca)
    const found = findCachedValues<HenrikMatch[]>(`henrik:matches:${acc.puuid}`)
      .flat()
      .find((m) => m.metadata?.match_id === matchId);
    if (found) {
      match = found;
      ownerPuuid = acc.puuid;
      break;
    }
  }
  if (!match) {
    throw Object.assign(
      new Error(
        'Partida fuera del cache — amplía la ventana o pulsa Actualizar para recargarla. Para partidas muy antiguas, lanza un backfill del historial (POST /api/valorant/backfill).',
      ),
      { code: 'NOT_CACHED' },
    );
  }
  const account = { puuid: ownerPuuid, name: '', tag: '' };
  const dicts = await getContent();
  const agentIconByName = new Map(Object.values(dicts.agents).map((e) => [e.name.toLowerCase(), e.icon]));
  const mapIconByName = new Map(Object.values(dicts.maps).map((e) => [e.name.toLowerCase(), e.icon]));

  const me = (match.players ?? []).find((p) => p.puuid === account.puuid);
  const myTeamId = me?.team_id ?? null;
  const myTeam = (match.teams ?? []).find((t) => t.team_id != null && t.team_id === myTeamId) ?? (match.teams ?? [])[0];

  const players: DetailPlayer[] = (match.players ?? []).map((p) => {
    const st = p.stats ?? {};
    const rounds = Math.max(1, henrikRounds(match));
    const shots = (st.headshots ?? 0) + (st.bodyshots ?? 0) + (st.legshots ?? 0);
    return {
      name: p.name ?? '?',
      tag: p.tag ?? '',
      agentName: p.agent?.name ?? '?',
      agentIcon: agentIconByName.get((p.agent?.name ?? '').toLowerCase()) ?? null,
      tier: p.tier?.id ?? 0,
      teamId: p.team_id ?? null,
      isMe: p.puuid === account.puuid,
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

  let fb = 0;
  let fd = 0;
  const seenRounds = new Set<number>();
  const killerCount = new Map<string, { times: number; weapon: string }>();
  for (const k of match.kills ?? []) {
    const r = k.round ?? -1;
    if (!seenRounds.has(r)) {
      seenRounds.add(r);
      if (k.killer?.puuid === account.puuid) fb++;
      if (k.victim?.puuid === account.puuid) fd++;
    }
    if (k.victim?.puuid === account.puuid && k.killer?.name) {
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
      date: new Date(henrikMatchTs(match)).toISOString(),
      durationMin: Math.round((match.metadata?.game_length_in_ms ?? 0) / 60000),
      seasonShort: match.metadata?.season?.short ?? '',
      myAgent: me?.agent?.name ?? '?',
      myAgentIcon: agentIconByName.get((me?.agent?.name ?? '').toLowerCase()) ?? null,
      won: Boolean(myTeam?.won),
      roundsWon: myTeam?.rounds?.won ?? 0,
      roundsLost: myTeam?.rounds?.lost ?? 0,
      rrDelta: null,
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

function henrikRounds(m: HenrikMatch): number {
  const teams = m.teams ?? [];
  let maxTeam = 0;
  for (const t of teams) maxTeam = Math.max(maxTeam, (t.rounds?.won ?? 0) + (t.rounds?.lost ?? 0));
  return Math.max(1, maxTeam);
}

function henrikMatchTs(m: HenrikMatch): number {
  const iso = m.metadata?.started_at;
  if (iso) {
    const t = Date.parse(iso);
    if (Number.isFinite(t)) return t;
  }
  return Date.now();
}
