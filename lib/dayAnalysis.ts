import type { MatchRow } from './types';

/**
 * Agrupación y análisis de partidas por día (todo client-side, $0 requests).
 * Los agregados usan los totales crudos del MatchRow (score/damage/shots)
 * para que K/D, ACS, ADR y HS% sean exactos, no promedios simples.
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

interface SubAgg {
  name: string;
  icon?: string | null;
  games: number;
  wins: number;
  draws: number;
  kills: number;
  deaths: number;
  score: number;
  rounds: number;
  damage: number;
  headshots: number;
  shots: number;
}

function newSub(name: string, icon?: string | null): SubAgg {
  return { name, icon, games: 0, wins: 0, draws: 0, kills: 0, deaths: 0, score: 0, rounds: 0, damage: 0, headshots: 0, shots: 0 };
}

function finishSub(s: SubAgg) {
  return {
    name: s.name,
    icon: s.icon,
    games: s.games,
    wins: s.wins,
    losses: s.games - s.wins - s.draws,
    kd: s.deaths ? s.kills / s.deaths : s.kills > 0 ? s.kills : 0,
    acs: s.rounds ? Math.round(s.score / s.rounds) : 0,
    adr: s.rounds ? Math.round(s.damage / s.rounds) : 0,
    hsPct: s.shots ? Math.round((s.headshots / s.shots) * 1000) / 10 : 0,
  };
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
  minutes: number;
  /** Partidas del día, más recientes primero */
  rows: MatchRow[];
  byAgent: ReturnType<typeof finishSub>[];
  byMap: ReturnType<typeof finishSub>[];
  bestMatch: MatchRow | null;
  worstMatch: MatchRow | null;
}

export function dayStats(group: DayGroup): DayStats {
  let wins = 0;
  let draws = 0;
  let kills = 0;
  let deaths = 0;
  let score = 0;
  let rounds = 0;
  let damage = 0;
  let headshots = 0;
  let shots = 0;
  let rrTotal: number | null = null;
  let minutes = 0;

  const agents = new Map<string, SubAgg>();
  const maps = new Map<string, SubAgg>();

  for (const m of group.matches) {
    // Empate = marcador igualado (p. ej. 14-14): no cuenta como derrota.
    const isDraw = m.roundsWon === m.roundsLost;
    if (isDraw) draws += 1;
    else if (m.won) wins += 1;
    kills += m.kills;
    deaths += m.deaths;
    score += m.score ?? m.acs * m.rounds;
    rounds += m.rounds || 0;
    damage += m.damageDealt ?? m.adr * m.rounds;
    headshots += m.headshots ?? 0;
    shots += m.shots ?? 0;
    if (m.rrDelta != null) rrTotal = (rrTotal ?? 0) + m.rrDelta;
    minutes += m.durationMin || 0;

    const a = agents.get(m.agent) ?? newSub(m.agent, m.agentIcon ?? null);
    const mp = maps.get(m.map) ?? newSub(m.map, m.mapIcon ?? null);
    for (const agg of [a, mp]) {
      agg.games += 1;
      if (isDraw) agg.draws += 1;
      else if (m.won) agg.wins += 1;
      agg.kills += m.kills;
      agg.deaths += m.deaths;
      agg.score += m.score ?? m.acs * m.rounds;
      agg.rounds += m.rounds || 0;
      agg.damage += m.damageDealt ?? m.adr * m.rounds;
      agg.headshots += m.headshots ?? 0;
      agg.shots += m.shots ?? 0;
    }
    agents.set(m.agent, a);
    maps.set(m.map, mp);
  }

  // Mejor/peor partida del día por ACS.
  const withAcs = group.matches.filter((m) => m.acs > 0);
  const bestMatch = withAcs.length ? withAcs.reduce((a, b) => (b.acs > a.acs ? b : a)) : null;
  const worstMatch = withAcs.length ? withAcs.reduce((a, b) => (b.acs < a.acs ? b : a)) : null;

  const n = group.matches.length;
  const decisive = n - draws;
  return {
    key: group.key,
    label: group.label,
    dayStart: group.dayStart,
    matches: n,
    wins,
    losses: n - wins - draws,
    draws,
    wr: decisive ? (wins / decisive) * 100 : 0,
    kd: deaths ? kills / deaths : kills > 0 ? kills : 0,
    acs: rounds ? Math.round(score / rounds) : 0,
    adr: rounds ? Math.round(damage / rounds) : 0,
    hsPct: shots ? Math.round((headshots / shots) * 1000) / 10 : 0,
    rrTotal,
    minutes,
    rows: group.matches,
    byAgent: [...agents.values()].map(finishSub).sort((a, b) => b.games - a.games),
    byMap: [...maps.values()].map(finishSub).sort((a, b) => b.games - a.games),
    bestMatch,
    worstMatch,
  };
}
