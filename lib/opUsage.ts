import type { HenrikMatch } from './henrik';
import { resolveWeaponIn, type WeaponContext } from './weaponResolve';

/**
 * Uso de la Operator en una partida, para no juzgar el HS% a ciegas.
 *
 * La Operator diluye el HS%: sus bodyshots matan igual que un headshot, así que
 * el crosshair placement no se puede medir con el mismo listón que en una
 * partida sin ella.
 *
 * OJO con la Tour De Force (la ult de Chamber): es la MISMA arma, pero llega por
 * la definitiva y por eso NO aparece en la economía de la ronda — ahí sigue
 * figurando lo comprado (Classic, Vandal…). El motor de armas
 * (`lib/weaponResolve.ts`) ya la resuelve por su id, así que aquí cuenta igual
 * que una Operator comprada.
 */

const OPERATOR_WEAPONS = new Set(['operator', 'tour de force']);
const TOUR_DE_FORCE = 'tour de force';

function esOperator(nombre: string | null | undefined): boolean {
  return nombre != null && OPERATOR_WEAPONS.has(nombre.trim().toLowerCase());
}

export interface OperatorUsage {
  /** Rondas con una Operator en mano (comprada o la ult). */
  rounds: number;
  /** Kills con Operator (comprada o la ult). */
  kills: number;
  /** De esas kills, cuántas fueron con la Tour De Force (la ult). */
  ultKills: number;
  /**
   * Rondas en las que la Operator fue TODO lo que disparaste: cada kill de la
   * ronda salió de ella y no hubo ni un impacto de otra arma. Solo esas se
   * pueden descontar del HS% sin inventar nada.
   */
  pureRounds: number;
  /** Impactos de esas rondas puras, para poder descontarlos del HS%. */
  pureHeadshots: number;
  pureBodyshots: number;
  pureLegshots: number;
}

export const NO_OPERATOR: OperatorUsage = {
  rounds: 0,
  kills: 0,
  ultKills: 0,
  pureRounds: 0,
  pureHeadshots: 0,
  pureBodyshots: 0,
  pureLegshots: 0,
};

/** ¿Hubo Operator de algún tipo (comprada o ult)? Es lo que activa el aviso. */
export function usedOperator(usage: OperatorUsage): boolean {
  return usage.rounds > 0 || usage.kills > 0;
}

/**
 * Cuenta el uso de Operator de un jugador en una partida.
 *
 * Las rondas se detectan por dos vías, porque ninguna basta sola: la economía
 * (Operator comprada) y el kill feed (la ult, que no pasa por la economía).
 */
export function operatorUsage(match: HenrikMatch, puuid: string, ctx: WeaponContext): OperatorUsage {
  const killsOpPorRonda = new Map<number, number>();
  let kills = 0;
  let ultKills = 0;

  for (const k of match.kills ?? []) {
    if (k.killer?.puuid !== puuid) continue;
    const w = resolveWeaponIn(ctx, k).name;
    if (!esOperator(w)) continue;
    kills += 1;
    if (w.trim().toLowerCase() === TOUR_DE_FORCE) ultKills += 1;
    const r = k.round ?? -1;
    killsOpPorRonda.set(r, (killsOpPorRonda.get(r) ?? 0) + 1);
  }

  let rounds = 0;
  let pureRounds = 0;
  let pureHeadshots = 0;
  let pureBodyshots = 0;
  let pureLegshots = 0;

  for (const r of match.rounds ?? []) {
    const rid = r.id ?? -1;
    const st = (r.stats ?? []).find((s) => s.player?.puuid === puuid);
    const killsOp = killsOpPorRonda.get(rid) ?? 0;
    // La economía ve la Operator comprada; el feed ve la que vino de la ult.
    if (!esOperator(st?.economy?.weapon?.name) && killsOp === 0) continue;
    rounds += 1;

    if (killsOp === 0) continue;
    const h = st?.stats?.headshots ?? 0;
    const b = st?.stats?.bodyshots ?? 0;
    const l = st?.stats?.legshots ?? 0;
    const impactos = h + b + l;
    const killsRonda = st?.stats?.kills ?? 0;
    // Pura = todos tus disparos de la ronda fueron con la Operator: cada kill
    // suya y ni un impacto de otra arma. Con mezcla no se descuenta nada.
    if (killsOp === killsRonda && impactos === killsOp) {
      pureRounds += 1;
      pureHeadshots += h;
      pureBodyshots += b;
      pureLegshots += l;
    }
  }

  return { rounds, kills, ultKills, pureRounds, pureHeadshots, pureBodyshots, pureLegshots };
}

export interface HsWithoutOperator {
  /** HS% descontando los impactos de las rondas puras de Operator. */
  hsPct: number;
  headshots: number;
  /** Impactos que quedan tras el descuento. */
  hits: number;
  /** Impactos de Operator descontados. */
  removed: number;
}

/**
 * HS% «limpio»: quita los impactos de las rondas en las que la Operator fue tu
 * único disparo. Devuelve null cuando no hay nada que descontar (sin rondas
 * puras), que es la señal de que el HS% bruto ya es comparable.
 *
 * Es deliberadamente conservador: en las rondas con mezcla de armas no toca
 * nada, porque ahí no se puede separar un bodyshot de Operator de uno de rifle.
 */
export function hsPctWithoutOperator(
  totals: { headshots?: number; bodyshots?: number; legshots?: number } | null | undefined,
  usage: OperatorUsage,
): HsWithoutOperator | null {
  if (usage.pureRounds === 0) return null;
  const h = totals?.headshots ?? 0;
  const b = totals?.bodyshots ?? 0;
  const l = totals?.legshots ?? 0;
  const removed = usage.pureHeadshots + usage.pureBodyshots + usage.pureLegshots;
  const hits = h + b + l - removed;
  if (hits <= 0 || removed <= 0) return null;
  const headshots = h - usage.pureHeadshots;
  return {
    hsPct: Math.round((headshots / hits) * 1000) / 10,
    headshots,
    hits,
    removed,
  };
}

/** Texto corto para tooltips: «2 rondas con Operator · 5 kills (5 con la ult)». */
export function operatorLabel(usage: { rounds: number; kills: number; ultKills?: number }): string {
  const partes = [`${usage.rounds} ${usage.rounds === 1 ? 'ronda' : 'rondas'} con Operator`];
  if (usage.kills > 0) {
    const ult = (usage.ultKills ?? 0) > 0 ? ` (${usage.ultKills} con la ult)` : '';
    partes.push(`${usage.kills} ${usage.kills === 1 ? 'kill' : 'kills'}${ult}`);
  }
  return partes.join(' · ');
}
