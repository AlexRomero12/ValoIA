import type { MatchRow } from './types';

/**
 * Aporte individual dentro de la partida (client-side, $0 requests).
 *
 * Usa el puesto por ACS calculado en el servidor (`teamRank`/`lobbyRank`) y la
 * lista de compañeros (`mates`) que ya viajan en el `MatchRow`. Todo lo que no
 * esté en el payload (p. ej. proveedor Riot sin detalle) se ignora en lugar de
 * inventarse: los denominadores reflejan solo las partidas con dato.
 */

export interface PlacementStats {
  /** Partidas con puesto de equipo utilizable. */
  games: number;
  /** Partidas con puesto de lobby utilizable. */
  lobbyGames: number;
  /** Puesto medio en el equipo (1 = top). */
  avgTeam: number | null;
  /** Puesto medio entre los 10 del lobby. */
  avgLobby: number | null;
  /** % de partidas en las que quedó último del equipo. */
  lastPct: number;
  /** % de partidas en el bottom-2 del equipo (4º-5º). */
  bottom2Pct: number;
  /** % de partidas por debajo de la media de ACS de sus compañeros. */
  belowAvgPct: number;
  /** Partidas con `mateAcs` (denominador de `belowAvgPct`). */
  belowAvgGames: number;
  /** WR cuando quedó último del equipo. */
  wrWhenLast: number | null;
  /** WR cuando quedó top-2 del equipo. */
  wrWhenTop2: number | null;
}

/** Tamaño de equipo inferido de la lista de compañeros (yo + mates). */
export function teamSizeOf(m: MatchRow): number | null {
  if (!Array.isArray(m.mates)) return null;
  return m.mates.length + 1;
}

function winRate(list: MatchRow[]): number | null {
  const decisive = list.filter((m) => m.roundsWon !== m.roundsLost);
  if (!decisive.length) return null;
  return (decisive.filter((m) => m.won).length / decisive.length) * 100;
}

function mean(list: number[]): number | null {
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
}

export function placementStats(matches: MatchRow[]): PlacementStats {
  const teamRows: { m: MatchRow; rank: number; size: number }[] = [];
  const lobbyRanks: number[] = [];
  const belowAvg: MatchRow[] = [];

  for (const m of matches) {
    const size = teamSizeOf(m);
    if (size != null && size >= 3 && typeof m.teamRank === 'number') {
      teamRows.push({ m, rank: m.teamRank, size });
    }
    if (typeof m.lobbyRank === 'number') lobbyRanks.push(m.lobbyRank);
    if (typeof m.mateAcs === 'number' && m.acs > 0) belowAvg.push(m);
  }

  const last = teamRows.filter((r) => r.rank === r.size);
  const bottom2 = teamRows.filter((r) => r.rank >= r.size - 1);
  const top2 = teamRows.filter((r) => r.rank <= 2);
  const below = belowAvg.filter((m) => m.acs < (m.mateAcs as number));

  const pct = (n: number, d: number) => (d ? (n / d) * 100 : 0);

  return {
    games: teamRows.length,
    lobbyGames: lobbyRanks.length,
    avgTeam: mean(teamRows.map((r) => r.rank)),
    avgLobby: mean(lobbyRanks),
    lastPct: pct(last.length, teamRows.length),
    bottom2Pct: pct(bottom2.length, teamRows.length),
    belowAvgPct: pct(below.length, belowAvg.length),
    belowAvgGames: belowAvg.length,
    wrWhenLast: winRate(last.map((r) => r.m)),
    wrWhenTop2: winRate(top2.map((r) => r.m)),
  };
}
