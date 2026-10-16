import { describe, expect, it } from 'vitest';
import { hsPctWithoutOperator, operatorLabel, operatorUsage, usedOperator } from './opUsage';
import { weaponContext, weaponDictsFrom } from './weaponResolve';
import type { HenrikKill, HenrikMatch } from './henrik';

const dicts = weaponDictsFrom({
  weapons: { vandal: { icon: null }, classic: { icon: null }, operator: { icon: null } },
  abilities: { 'tour de force': { icon: 'tdf.png' }, headhunter: { icon: 'hh.png' } },
});

const YO = 'yo';
const RIVAL = 'rival';

/** Las kill de la Tour De Force llegan SIN nombre: solo el id. */
const TOUR_DE_FORCE = '39099fb5-4293-def4-1e09-2e9080ce7456';
const HEADHUNTER = '856d9a7e-4b06-dc37-15dc-9d809c37cb90';

function kill(ronda: number, weapon: HenrikKill['weapon']): HenrikKill {
  return { round: ronda, killer: { puuid: YO }, victim: { puuid: RIVAL }, weapon };
}

function ronda(
  id: number,
  opts: { arma: string; kills?: number; headshots?: number; bodyshots?: number; legshots?: number },
) {
  return {
    id,
    stats: [
      {
        player: { puuid: YO },
        economy: { weapon: { name: opts.arma } },
        stats: {
          kills: opts.kills ?? 0,
          headshots: opts.headshots ?? 0,
          bodyshots: opts.bodyshots ?? 0,
          legshots: opts.legshots ?? 0,
        },
      },
    ],
  };
}

/**
 * El caso real del 15 oct (Summit/Chamber), reducido a lo que importa: la ult
 * se usó en dos rondas y en la economía de esas rondas figuraba el Classic.
 */
function partidaDel15(): HenrikMatch {
  return {
    metadata: {},
    players: [{ puuid: YO, name: 'Alex', agent: { name: 'Chamber' } }],
    rounds: [
      ronda(7, { arma: 'Operator', headshots: 1, bodyshots: 4 }),
      ronda(8, { arma: 'Classic', kills: 4, bodyshots: 4 }),
      ronda(14, { arma: 'Vandal', kills: 1, bodyshots: 4 }),
      ronda(17, { arma: 'Classic', kills: 1, bodyshots: 1 }),
    ],
    kills: [
      kill(8, { id: TOUR_DE_FORCE, type: 'Weapon' }),
      kill(8, { id: TOUR_DE_FORCE, type: 'Weapon' }),
      kill(8, { id: TOUR_DE_FORCE, type: 'Weapon' }),
      kill(8, { id: TOUR_DE_FORCE, type: 'Weapon' }),
      kill(14, { name: 'Vandal', type: 'Weapon' }),
      kill(17, { id: TOUR_DE_FORCE, type: 'Weapon' }),
    ],
  };
}

describe('operatorUsage · la Operator comprada y la de la ult', () => {
  it('cuenta la Tour De Force (la ult) aunque no pase por la economía', () => {
    const m = partidaDel15();
    const op = operatorUsage(m, YO, weaponContext(m, dicts));
    expect(op.kills).toBe(5);
    expect(op.ultKills).toBe(5);
  });

  it('suma las rondas de la ult a las de la Operator comprada', () => {
    const m = partidaDel15();
    const op = operatorUsage(m, YO, weaponContext(m, dicts));
    // R7 (comprada) + R8 y R17 (ult). La R14 fue Vandal.
    expect(op.rounds).toBe(3);
  });

  it('marca como puras solo las rondas en las que la Operator fue todo lo que disparaste', () => {
    const m = partidaDel15();
    const op = operatorUsage(m, YO, weaponContext(m, dicts));
    // R8 (4 kills = 4 impactos) y R17 (1 = 1). La R7 compró Operator pero no
    // mató con ella: ahí no se puede separar, así que no se descuenta.
    expect(op.pureRounds).toBe(2);
    expect(op.pureHeadshots).toBe(0);
    expect(op.pureBodyshots).toBe(5);
  });

  it('la Headhunter NO cuenta como Operator: premia el headshot, no lo diluye', () => {
    const m: HenrikMatch = {
      metadata: {},
      players: [{ puuid: YO, name: 'Alex', agent: { name: 'Chamber' } }],
      rounds: [ronda(0, { arma: 'Classic', kills: 2, headshots: 2, bodyshots: 1 })],
      kills: [kill(0, { id: HEADHUNTER, type: 'Weapon' }), kill(0, { id: HEADHUNTER, type: 'Weapon' })],
    };
    const op = operatorUsage(m, YO, weaponContext(m, dicts));
    expect(usedOperator(op)).toBe(false);
    expect(op).toMatchObject({ rounds: 0, kills: 0, pureRounds: 0 });
  });

  it('una ronda con mezcla de armas no se marca como pura', () => {
    const m: HenrikMatch = {
      metadata: {},
      players: [{ puuid: YO, name: 'Alex', agent: { name: 'Chamber' } }],
      // 2 kills con la ult + 1 con Vandal en la misma ronda: 4 impactos, 3 kills.
      rounds: [ronda(5, { arma: 'Classic', kills: 3, headshots: 1, bodyshots: 3 })],
      kills: [
        kill(5, { id: TOUR_DE_FORCE, type: 'Weapon' }),
        kill(5, { id: TOUR_DE_FORCE, type: 'Weapon' }),
        kill(5, { name: 'Vandal', type: 'Weapon' }),
      ],
    };
    const op = operatorUsage(m, YO, weaponContext(m, dicts));
    expect(op.kills).toBe(2);
    expect(op.pureRounds).toBe(0);
    expect(hsPctWithoutOperator({ headshots: 1, bodyshots: 3, legshots: 0 }, op)).toBeNull();
  });

  it('sin Operator no inventa nada', () => {
    const m: HenrikMatch = {
      metadata: {},
      players: [{ puuid: YO, name: 'Alex', agent: { name: 'Sova' } }],
      rounds: [ronda(1, { arma: 'Vandal', kills: 1, headshots: 1, bodyshots: 2 })],
      kills: [kill(1, { name: 'Vandal', type: 'Weapon' })],
    };
    const op = operatorUsage(m, YO, weaponContext(m, dicts));
    expect(usedOperator(op)).toBe(false);
    expect(op.rounds).toBe(0);
  });
});

describe('hsPctWithoutOperator · el HS% que queda al quitar la Operator', () => {
  it('descuenta los impactos de las rondas puras', () => {
    const m = partidaDel15();
    const op = operatorUsage(m, YO, weaponContext(m, dicts));
    // Totales de la partida real: 9 heads / 31 bodies / 0 legs = 40 impactos.
    const hs = hsPctWithoutOperator({ headshots: 9, bodyshots: 31, legshots: 0 }, op);
    expect(hs).not.toBeNull();
    expect(hs!.removed).toBe(5);
    expect(hs!.hits).toBe(35);
    expect(hs!.headshots).toBe(9);
    expect(hs!.hsPct).toBeCloseTo(25.7, 1);
  });

  it('sin rondas puras devuelve null (el HS% bruto ya es comparable)', () => {
    const m: HenrikMatch = {
      metadata: {},
      players: [{ puuid: YO, name: 'Alex', agent: { name: 'Chamber' } }],
      rounds: [ronda(7, { arma: 'Operator', headshots: 1, bodyshots: 4 })],
      kills: [],
    };
    const op = operatorUsage(m, YO, weaponContext(m, dicts));
    expect(op.rounds).toBe(1);
    expect(hsPctWithoutOperator({ headshots: 9, bodyshots: 31, legshots: 0 }, op)).toBeNull();
  });
});

describe('operatorLabel / usedOperator · lo que ve el usuario', () => {
  it('resume rondas y kills, distinguiendo las de la ult', () => {
    expect(operatorLabel({ rounds: 3, kills: 5, ultKills: 5 })).toBe('3 rondas con Operator · 5 kills (5 con la ult)');
  });

  it('singular y sin kills', () => {
    expect(operatorLabel({ rounds: 1, kills: 0 })).toBe('1 ronda con Operator');
  });

  it('usedOperator es falso solo cuando no hubo ni rondas ni kills', () => {
    expect(usedOperator({ rounds: 0, kills: 0, ultKills: 0, pureRounds: 0, pureHeadshots: 0, pureBodyshots: 0, pureLegshots: 0 })).toBe(false);
    expect(usedOperator({ rounds: 1, kills: 0, ultKills: 0, pureRounds: 0, pureHeadshots: 0, pureBodyshots: 0, pureLegshots: 0 })).toBe(true);
  });
});
