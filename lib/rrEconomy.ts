import type { MatchRow } from './types';

/**
 * Economía de RR (client-side): cuánto gana de media por victoria, cuánto
 * pierde por derrota y el WR de equilibrio (`breakEven`) — el winrate a partir
 * del cual el RR neto deja de caer. Solo usa `rrDelta` disponibles (la API
 * devuelve RR de ~20 partidas): con un solo signo no hay equilibrio posible.
 */

export interface RrEconomy {
  /** Partidas con dato de RR. */
  n: number;
  /** Media de RR ganado por victoria. */
  avgWin: number;
  /** Media de RR perdido por derrota (negativa). */
  avgLoss: number;
  /** WR de equilibrio en % (sube de rango por encima). */
  breakEven: number;
  /** RR neto de las partidas con dato. */
  net: number;
  /** Victorias / derrotas con dato de RR. */
  wins: number;
  losses: number;
}

export function rrEconomy(matches: MatchRow[]): RrEconomy | null {
  const deltas = matches
    .map((m) => m.rrDelta)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const pos = deltas.filter((v) => v > 0);
  const neg = deltas.filter((v) => v < 0);
  if (!pos.length || !neg.length) return null;

  const avgWin = pos.reduce((a, b) => a + b, 0) / pos.length;
  const avgLoss = neg.reduce((a, b) => a + b, 0) / neg.length;
  const gain = avgWin + Math.abs(avgLoss);
  return {
    n: deltas.length,
    avgWin,
    avgLoss,
    breakEven: gain ? (Math.abs(avgLoss) / gain) * 100 : 0,
    net: deltas.reduce((a, b) => a + b, 0),
    wins: pos.length,
    losses: neg.length,
  };
}
