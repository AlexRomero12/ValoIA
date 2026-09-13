/**
 * Forma reciente de un jugador y deltas de KPIs (puro, isomorfo).
 * La entrada llega en orden cronológico inverso (más reciente primero),
 * como `ValSummary.matches`.
 */

export type FormResult = 'V' | 'D' | 'E';

export interface FormMatch {
  won: boolean;
  roundsWon: number;
  roundsLost: number;
}

export interface MatchForm {
  /** Últimas N partidas, más reciente primero. */
  last: FormResult[];
  /** Racha actual (se corta con un empate). */
  streak: { type: 'win' | 'loss'; count: number } | null;
}

/** V = victoria, D = derrota, E = empate (marcador igualado). */
export function resultOf(m: FormMatch): FormResult {
  if (m.roundsWon === m.roundsLost) return 'E';
  return m.won ? 'V' : 'D';
}

export function formOf(matches: readonly FormMatch[], limit = 5): MatchForm {
  const last = matches.slice(0, limit).map(resultOf);
  const first = matches[0] ? resultOf(matches[0]) : null;
  let streak: MatchForm['streak'] = null;
  if (first === 'V' || first === 'D') {
    let count = 0;
    for (const m of matches) {
      if (resultOf(m) !== first) break;
      count += 1;
    }
    streak = { type: first === 'V' ? 'win' : 'loss', count };
  }
  return { last, streak };
}

/** Diferencia contra la ventana anterior; null si falta cualquiera de los dos datos. */
export function deltaOf(current: number | undefined | null, prev: number | undefined | null): number | null {
  if (current == null || prev == null) return null;
  if (!Number.isFinite(current) || !Number.isFinite(prev)) return null;
  return current - prev;
}
