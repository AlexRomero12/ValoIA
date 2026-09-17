import { describe, expect, it } from 'vitest';
import { roundImpact } from './impact';
import type { HenrikKill } from './henrik';

const ME = 'me-puuid';
const RIVAL = 'rival-puuid';

function kill(round: number | undefined, victim: string, killer = ME): HenrikKill {
  return { round, killer: { puuid: killer }, victim: { name: victim } };
}

describe('roundImpact', () => {
  it('cuenta dobles, triples, cuádruples y aces por ronda', () => {
    const kills: HenrikKill[] = [
      kill(0, 'a'),
      kill(0, 'b'),
      kill(1, 'a'),
      kill(1, 'b'),
      kill(1, 'c'),
      kill(2, 'a'),
      kill(2, 'b'),
      kill(2, 'c'),
      kill(2, 'd'),
      kill(3, 'a'),
      kill(3, 'b'),
      kill(3, 'c'),
      kill(3, 'd'),
      kill(3, 'e'),
      kill(4, 'a'), // ronda de una sola kill: no cuenta
    ];
    expect(roundImpact(kills, ME).multikills).toEqual({ two: 1, three: 1, four: 1, five: 1 });
  });

  it('un round con 6+ kills cuenta como ace (dato corrupto), sin desbordar', () => {
    const kills = Array.from({ length: 6 }, (_, i) => kill(5, `v${i}`));
    expect(roundImpact(kills, ME).multikills).toEqual({ two: 0, three: 0, four: 0, five: 1 });
  });

  it('ignora las kills de otros jugadores', () => {
    const kills = [kill(0, 'a', RIVAL), kill(0, 'b', RIVAL), kill(0, 'me-victim', RIVAL)];
    expect(roundImpact(kills, ME)).toEqual({
      multikills: { two: 0, three: 0, four: 0, five: 0 },
      victims: [],
    });
  });

  it('ordena las víctimas por veces y desempata por nombre, con tope', () => {
    const kills = [
      kill(0, 'Zeta'),
      kill(1, 'Zeta'),
      kill(2, 'Zeta'),
      kill(3, 'Alpha'),
      kill(4, 'Alpha'),
      kill(5, 'Beta'),
      kill(6, 'Gamma'),
    ];
    expect(roundImpact(kills, ME).victims).toEqual([
      { name: 'Zeta', times: 3 },
      { name: 'Alpha', times: 2 },
      { name: 'Beta', times: 1 },
    ]);
    expect(roundImpact(kills, ME, 4).victims.map((v) => v.name)).toEqual(['Zeta', 'Alpha', 'Beta', 'Gamma']);
  });

  it('las kills sin ronda cuentan como víctimas pero no como bajas múltiples', () => {
    const kills = [kill(undefined, 'a'), kill(undefined, 'b'), kill(7, 'c')];
    const impact = roundImpact(kills, ME);
    expect(impact.multikills).toEqual({ two: 0, three: 0, four: 0, five: 0 });
    expect(impact.victims.map((v) => v.name)).toEqual(['a', 'b', 'c']);
  });

  it('kill feed vacío o ausente: todo a cero', () => {
    const empty = { multikills: { two: 0, three: 0, four: 0, five: 0 }, victims: [] };
    expect(roundImpact([], ME)).toEqual(empty);
    expect(roundImpact(undefined, ME)).toEqual(empty);
  });
});
