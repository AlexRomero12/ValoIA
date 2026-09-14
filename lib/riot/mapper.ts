import { tierName } from '../ranks';
import type { MatchKill, MatchPlayer, MatchRecord, MatchRound, MatchTeam } from '../providers/types';
import type { ContentDicts } from './content';
import { mapDisplayName } from './content';
import type { RiotMatchDto, RiotPlayerDto } from './types';

/**
 * Mapper Riot MatchDto -> MatchRecord (modelo interno).
 *
 * El mock produce el mismo MatchDto que producción, así que este mapper es el
 * único punto que conoce el esquema de Riot: al pasar a `live` no cambia nada.
 * Los totales de daño/HS% se agregan desde `roundResults` (única fuente de
 * disparos en la API oficial).
 */

interface DamageTotals {
  dealt: number;
  received: number;
  headshots: number;
  bodyshots: number;
  legshots: number;
}

export function mapMatchDto(dto: RiotMatchDto, dicts: ContentDicts): MatchRecord {
  const info = dto.matchInfo ?? { matchId: '' };
  const riotPlayers = dto.players ?? [];
  const byPuuid = new Map<string, RiotPlayerDto>();
  for (const p of riotPlayers) byPuuid.set(p.puuid, p);

  const damage = new Map<string, DamageTotals>();
  const totals = (puuid: string): DamageTotals => {
    const cur = damage.get(puuid) ?? { dealt: 0, received: 0, headshots: 0, bodyshots: 0, legshots: 0 };
    damage.set(puuid, cur);
    return cur;
  };

  const kills: MatchKill[] = [];
  const rounds: MatchRound[] = [];
  const economySpent = new Map<string, number>();
  const economyLoadout = new Map<string, { sum: number; n: number }>();
  const afkByPlayer = new Map<string, number>();

  const roundResults = [...(dto.roundResults ?? [])].sort((a, b) => (a.roundNum ?? 0) - (b.roundNum ?? 0));
  for (const rr of roundResults) {
    const roundNum = rr.roundNum ?? rounds.length + 1;
    const roundIdx = Math.max(0, roundNum - 1);
    for (const ps of rr.playerStats ?? []) {
      const pid = ps.puuid;
      if (!pid) continue;
      // Daño: la fila `subject` lo hizo y `receiver` lo recibió.
      for (const d of ps.damage ?? []) {
        const amount = d.damage ?? 0;
        totals(pid).dealt += amount;
        if (d.receiver) totals(d.receiver).received += amount;
        const t = totals(pid);
        t.headshots += d.headshots ?? 0;
        t.bodyshots += d.bodyshots ?? 0;
        t.legshots += d.legshots ?? 0;
      }
      for (const k of ps.kills ?? []) {
        const weaponId = k.finishingDamage?.damageItem?.toLowerCase() ?? null;
        const weaponInfo = weaponId ? dicts.weaponsById[weaponId] : undefined;
        const killer = k.killer ?? pid;
        const victim = k.victim ?? k.victims?.[0];
        kills.push({
          killer: {
            puuid: killer,
            name: byPuuid.get(killer)?.gameName ?? '',
            team: byPuuid.get(killer)?.teamId,
          },
          victim: {
            puuid: victim,
            name: victim ? (byPuuid.get(victim)?.gameName ?? '') : '',
            team: victim ? byPuuid.get(victim)?.teamId : undefined,
          },
          assistants: (k.assistants ?? []).map((a) => ({ puuid: a, name: byPuuid.get(a)?.gameName ?? '' })),
          weapon: {
            id: k.finishingDamage?.damageItem ?? null,
            name: weaponInfo?.name ?? null,
            type: weaponInfo?.category ?? k.finishingDamage?.damageType ?? null,
          },
          round: roundIdx,
        });
      }
      const eco = ps.economy;
      if (eco) {
        economySpent.set(pid, (economySpent.get(pid) ?? 0) + (eco.spent ?? 0));
        const load = economyLoadout.get(pid) ?? { sum: 0, n: 0 };
        load.sum += eco.loadoutValue ?? 0;
        load.n += 1;
        economyLoadout.set(pid, load);
      }
      if (ps.wasAfk) afkByPlayer.set(pid, (afkByPlayer.get(pid) ?? 0) + 1);
    }
    const plantBy = rr.bombPlanter ? byPuuid.get(rr.bombPlanter) : undefined;
    const defuseBy = rr.bombDefuser ? byPuuid.get(rr.bombDefuser) : undefined;
    rounds.push({
      id: roundIdx,
      result: rr.roundResult ?? rr.roundResultCode ?? '',
      winning_team: rr.winningTeam ?? null,
      plant: plantBy
        ? { site: rr.plantSite ?? undefined, player: { puuid: rr.bombPlanter, name: plantBy.gameName ?? '' } }
        : rr.plantSite
          ? { site: rr.plantSite, player: undefined }
          : null,
      defuse: defuseBy ? { player: { puuid: rr.bombDefuser, name: defuseBy.gameName ?? '' } } : null,
    });
  }

  const players: MatchPlayer[] = riotPlayers.map((p) => {
    const dmg = damage.get(p.puuid);
    const st = p.stats ?? {};
    const agentInfo = p.characterId ? dicts.agents[p.characterId.toLowerCase()] : undefined;
    return {
      puuid: p.puuid,
      name: p.gameName ?? '',
      tag: p.tagLine ?? '',
      team_id: p.teamId,
      agent: {
        id: p.characterId,
        name: agentInfo?.name ?? p.characterId ?? '?',
      },
      tier: {
        id: p.competitiveTier ?? 0,
        name: tierName(p.competitiveTier ?? 0),
      },
      stats: {
        score: st.score ?? 0,
        kills: st.kills ?? 0,
        deaths: st.deaths ?? 0,
        assists: st.assists ?? 0,
        headshots: dmg?.headshots ?? 0,
        bodyshots: dmg?.bodyshots ?? 0,
        legshots: dmg?.legshots ?? 0,
        damage: { dealt: dmg?.dealt ?? 0, received: dmg?.received ?? 0 },
      },
      economy: {
        spent: { overall: economySpent.get(p.puuid) ?? 0 },
        loadout_value: {
          average: (() => {
            const load = economyLoadout.get(p.puuid);
            return load && load.n ? load.sum / load.n : 0;
          })(),
        },
      },
      behavior: { afk_rounds: afkByPlayer.get(p.puuid) ?? 0 },
    };
  });

  const teams: MatchTeam[] = (dto.teams ?? []).map((t) => ({
    team_id: t.teamId,
    won: t.won ?? null,
    rounds: {
      won: t.roundsWon ?? 0,
      lost: Math.max(0, (t.roundsPlayed ?? 0) - (t.roundsWon ?? 0)),
    },
  }));

  return {
    metadata: {
      match_id: info.matchId,
      map: { id: info.mapId, name: mapDisplayName(info.mapId, dicts) },
      started_at: info.gameStartMillis ? new Date(info.gameStartMillis).toISOString() : undefined,
      game_length_in_ms: info.gameLengthMillis ?? 0,
      is_completed: info.isCompleted,
      queue: { id: info.queueID, name: info.queueID ?? null, mode_type: info.gameMode ?? null },
      platform: 'pc',
    },
    players,
    teams,
    kills,
    rounds,
  };
}
