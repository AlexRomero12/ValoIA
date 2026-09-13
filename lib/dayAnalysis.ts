import type { MatchRow } from './types';
import { computeStats, groupMatches } from './stats';

/**
 * Agrupación y análisis de partidas por día (todo client-side, $0 requests).
 * La agregación delega en lib/stats.ts: única fuente de WR/K/D/ACS/ADR/HS%,
 * con los totales crudos del MatchRow para que no diverjan entre vistas.
 */

export interface DayGroup {
  /** clave local YYYY-MM-DD */
  key: string;
  /** timestamp de la primera partida del día (ms) */
  dayStart: number;
  /** etiqueta corta, p. ej. "mar 25 ago" */
  label: string;
  matches: MatchRow[];
}

export function groupByDay(matches: MatchRow[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const m of [...matches].sort((a, b) => b.timestamp - a.timestamp)) {
    const d = new Date(m.timestamp);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        dayStart: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(),
        label: d.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' }),
        matches: [],
      };
      groups.set(key, g);
    }
    g.matches.push(m);
  }
  return [...groups.values()];
}

export interface DaySubStats {
  name: string;
  icon: string | null;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  kd: number;
  acs: number;
  adr: number;
  hsPct: number;
}

export interface DayStats {
  key: string;
  label: string;
  dayStart: number;
  matches: number;
  wins: number;
  losses: number;
  /** Empates (marcador igualado): no cuentan ni como victoria ni como derrota */
  draws: number;
  wr: number;
  kd: number;
  acs: number;
  adr: number;
  hsPct: number;
  rrTotal: number | null;
  /** Partidas del día sin dato de RR (rrTotal parcial si > 0). */
  rrMissing: number;
  minutes: number;
  /** Partidas del día, más recientes primero */
  rows: MatchRow[];
  byAgent: DaySubStats[];
  byMap: DaySubStats[];
  bestMatch: MatchRow | null;
  worstMatch: MatchRow | null;
}

function subStats(
  list: MatchRow[],
  pick: (m: MatchRow) => string,
  iconOf: (m: MatchRow) => string | null | undefined,
): DaySubStats[] {
  return [...groupMatches(list, pick).entries()]
    .map(([name, ms]) => {
      const s = computeStats(ms);
      return {
        name,
        icon: ms.map(iconOf).find((i) => i) ?? null,
        games: s.games,
        wins: s.wins,
        losses: s.losses,
        draws: s.draws,
        kd: s.kd,
        acs: s.acs,
        adr: s.adr,
        hsPct: s.hsPct,
      };
    })
    .sort((a, b) => b.games - a.games);
}

export function dayStats(group: DayGroup): DayStats {
  const s = computeStats(group.matches);
  let minutes = 0;
  for (const m of group.matches) minutes += m.durationMin || 0;

  // Mejor/peor partida del día por ACS.
  const withAcs = group.matches.filter((m) => m.acs > 0);
  const bestMatch = withAcs.length ? withAcs.reduce((a, b) => (b.acs > a.acs ? b : a)) : null;
  const worstMatch = withAcs.length ? withAcs.reduce((a, b) => (b.acs < a.acs ? b : a)) : null;

  return {
    key: group.key,
    label: group.label,
    dayStart: group.dayStart,
    matches: s.games,
    wins: s.wins,
    losses: s.losses,
    draws: s.draws,
    wr: s.wr,
    kd: s.kd,
    acs: s.acs,
    adr: s.adr,
    hsPct: s.hsPct,
    rrTotal: s.rrTotal,
    rrMissing: s.rrMissing,
    minutes,
    rows: group.matches,
    byAgent: subStats(group.matches, (m) => m.agent, (m) => m.agentIcon),
    byMap: subStats(group.matches, (m) => m.map, (m) => m.mapIcon),
    bestMatch,
    worstMatch,
  };
}
