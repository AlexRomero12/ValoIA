/**
 * Agregación de stats de partidas (pura e isomorfa: cliente y servidor).
 *
 * Única fuente de verdad para WR/K/D/ACS/ADR/HS%, alimentada tanto por
 * `MatchRow` (cliente) como por `MatchSummary` (servidor). Los totales crudos
 * (`score`, `damageDealt`, `headshots`, `shots`) se usan cuando existen; si no,
 * se reconstruyen desde los valores redondeados por partida ponderando por
 * rondas para no meter ±0.5 por partida.
 */

/** Campos mínimos para agregar; `MatchRow` y `MatchSummary` la cumplen. */
export interface StatMatch {
  won: boolean;
  rounds: number;
  roundsWon: number;
  roundsLost: number;
  kills: number;
  deaths: number;
  acs: number;
  adr: number;
  hsPct: number;
  score?: number;
  damageDealt?: number;
  headshots?: number;
  shots?: number;
  firstBloods?: number | null;
  firstDeaths?: number | null;
}

export interface PlayerStats {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  wr: number;
  kd: number;
  acs: number;
  adr: number;
  hsPct: number;
  /** Primeras sangres por partida (promedio). */
  fb?: number;
  /** Primeras muertes por partida (promedio). */
  fd?: number;
}

/** Bloque de stats con el nombre de campo que usa el payload (`matches`). */
export interface StatBlock {
  matches: number;
  wins: number;
  draws: number;
  wr: number;
  kd: number;
  acs: number;
  adr: number;
  hsPct: number;
}

export function computeStats(ms: readonly StatMatch[]): PlayerStats {
  let wins = 0;
  let draws = 0;
  let kills = 0;
  let deaths = 0;
  let scoreW = 0;
  let dmgW = 0;
  let hsW = 0;
  let hsRaw = 0;
  let shotsRaw = 0;
  let rounds = 0;
  let fb = 0;
  let fd = 0;

  for (const m of ms) {
    // Empate (marcador igualado): no cuenta ni como victoria ni como derrota.
    if (m.roundsWon === m.roundsLost) draws += 1;
    else if (m.won) wins += 1;
    kills += m.kills;
    deaths += m.deaths;
    const rds = Math.max(1, m.rounds);
    scoreW += m.score ?? m.acs * rds;
    dmgW += m.damageDealt ?? m.adr * rds;
    hsW += m.hsPct * rds;
    hsRaw += m.headshots ?? 0;
    shotsRaw += m.shots ?? 0;
    rounds += rds;
    fb += m.firstBloods ?? 0;
    fd += m.firstDeaths ?? 0;
  }

  const games = ms.length;
  const decisive = games - draws;
  return {
    games,
    wins,
    losses: games - wins - draws,
    draws,
    wr: decisive ? (wins / decisive) * 100 : 0,
    kd: deaths ? kills / deaths : kills > 0 ? kills : 0,
    // ACS/ADR se redondean a entero: así se muestran en todo el dash.
    acs: rounds ? Math.round(scoreW / rounds) : 0,
    adr: rounds ? Math.round(dmgW / rounds) : 0,
    // HS% por conteo directo cuando hay crudos; si no, promedio ponderado del
    // HS% por partida.
    hsPct: shotsRaw ? (hsRaw / shotsRaw) * 100 : rounds ? hsW / rounds : 0,
    fb: games ? fb / games : undefined,
    fd: games ? fd / games : undefined,
  };
}

/** Adapta las stats al bloque del payload (`games` → `matches`). */
export function toStatBlock(s: PlayerStats): StatBlock {
  return {
    matches: s.games,
    wins: s.wins,
    draws: s.draws,
    wr: s.wr,
    kd: s.kd,
    acs: s.acs,
    adr: s.adr,
    hsPct: s.hsPct,
  };
}

/** Agrupa partidas por clave (orden de aparición) sin agregar todavía. */
export function groupMatches<T extends StatMatch>(ms: readonly T[], pick: (m: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const m of ms) {
    const key = pick(m);
    const list = groups.get(key);
    if (list) list.push(m);
    else groups.set(key, [m]);
  }
  return groups;
}
