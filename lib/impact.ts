import type { HenrikKill } from './henrik';

/**
 * Impacto del jugador en la partida desde el kill feed (ya cacheado, $0 requests):
 * bajas múltiples por ronda y a quién mató más veces.
 */

export interface Multikills {
  /** Rondas con 2, 3, 4 y 5+ kills tuyas (el 5 es el ace). */
  two: number;
  three: number;
  four: number;
  five: number;
}

export interface VictimCount {
  name: string;
  times: number;
}

export interface RoundImpact {
  multikills: Multikills;
  /** Víctimas ordenadas de mayor a menor (desempate por nombre). */
  victims: VictimCount[];
}

export function roundImpact(kills: HenrikKill[] | undefined, puuid: string, topVictims = 3): RoundImpact {
  const perRound = new Map<number, number>();
  const victims = new Map<string, number>();
  for (const k of kills ?? []) {
    if (k.killer?.puuid !== puuid) continue;
    if (k.victim?.name) victims.set(k.victim.name, (victims.get(k.victim.name) ?? 0) + 1);
    // Sin ronda identificable la kill no se puede atribuir a una ronda: queda
    // fuera de las bajas múltiples (sí cuenta como víctima).
    if (typeof k.round !== 'number') continue;
    perRound.set(k.round, (perRound.get(k.round) ?? 0) + 1);
  }

  const multikills: Multikills = { two: 0, three: 0, four: 0, five: 0 };
  for (const n of perRound.values()) {
    if (n >= 5) multikills.five += 1;
    else if (n === 4) multikills.four += 1;
    else if (n === 3) multikills.three += 1;
    else if (n === 2) multikills.two += 1;
  }

  const sorted = [...victims.entries()]
    .map(([name, times]) => ({ name, times }))
    .sort((a, b) => b.times - a.times || a.name.localeCompare(b.name))
    .slice(0, topVictims);

  return { multikills, victims: sorted };
}
