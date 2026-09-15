/**
 * Etiquetado automático de derrotas (solo presentación, ningún cambio en stats):
 *
 *  - 'unwinnable' (Injugable): perdida con 2+ compañeros muy malos — cargar
 *    3v5 es inviable — y el jugador no fue parte del problema.
 *  - 'mine' (Mi culpa): perdida donde el jugador quedó por debajo de la media
 *    de sus compañeros y con K/D negativo.
 *
 * Los insumos (mateAcs, mateBadCount) los calcula el servidor desde el detalle
 * de la partida ya cacheado ($0 requests extra).
 */

export interface LossFields {
  won: boolean;
  roundsWon: number;
  roundsLost: number;
  /** ACS del jugador en la partida. */
  acs: number;
  kills: number;
  deaths: number;
  /** ACS promedio de los compañeros (null/undefined si no hay detalle). */
  mateAcs?: number | null;
  /** Compañeros "muy malos" (por debajo de badMateAcs y badMateKd). */
  mateBadCount?: number | null;
}

export const UNWINNABLE_LIMITS = {
  /** Un compañero cuenta como "muy malo" por debajo de este ACS… */
  badMateAcs: 155,
  /** …y de este K/D (ambas condiciones a la vez). */
  badMateKd: 0.8,
  /** Con esta cantidad de compañeros muy malos la derrota se marca injugable. */
  badMates: 2,
  /** K/D máximo del jugador para considerar la derrota "culpa mía". */
  myFaultKd: 0.8,
} as const;

export type LossTag = 'unwinnable' | 'mine';

const TAGS: Record<LossTag, string> = {
  unwinnable: 'Derrota cargada por el equipo',
  mine: 'Derrota con responsabilidad tuya',
};

export function lossTag(m: LossFields): LossTag | null {
  // Solo derrotas (los empates no cuentan como derrota en el dash).
  if (m.won || m.roundsWon === m.roundsLost) return null;
  if (m.mateAcs == null) return null;
  const kd = m.deaths ? m.kills / m.deaths : m.kills;
  // Mi culpa: por debajo de la media del equipo y K/D negativo.
  if (m.acs < m.mateAcs && kd < UNWINNABLE_LIMITS.myFaultKd) return 'mine';
  // Injugable: 2+ compañeros muy malos y el jugador no fue el problema.
  if ((m.mateBadCount ?? 0) >= UNWINNABLE_LIMITS.badMates && m.acs >= m.mateAcs) return 'unwinnable';
  return null;
}

/** Tooltip del badge: el porqué del etiquetado, con los números que lo dispararon. */
export function lossTagTitle(m: LossFields, tag: LossTag): string {
  const kd = (m.deaths ? m.kills / m.deaths : m.kills).toFixed(2);
  const mateAcs = Math.round(m.mateAcs ?? 0);
  const base = `${TAGS[tag]}.`;
  if (tag === 'unwinnable') {
    return `${base} ${m.mateBadCount ?? 0} compañeros muy flojos (media del equipo: ${mateAcs} ACS) y tú ${m.acs} ACS. Solo visual: no cambia tus stats.`;
  }
  return `${base} Tú ${m.acs} ACS y ${kd} K/D frente a una media de ${mateAcs} ACS. Solo visual: no cambia tus stats.`;
}
