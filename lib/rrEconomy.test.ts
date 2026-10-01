import { describe, expect, it } from 'vitest';
import { rrEconomy } from './rrEconomy';
import type { MatchRow } from './types';

function match(rrDelta: number | null): MatchRow {
  return {
    matchId: `m${Math.random()}`,
    date: '',
    timestamp: 0,
    map: 'Ascent',
    agent: 'Jett',
    won: rrDelta != null && rrDelta > 0,
    rounds: 20,
    roundsWon: 13,
    roundsLost: 7,
    kills: 0,
    deaths: 0,
    assists: 0,
    acs: 0,
    adr: 0,
    hsPct: 0,
    tier: 18,
    tierChange: 0,
    durationMin: 30,
    rrDelta,
  };
}

describe('rrEconomy', () => {
  it('calcula medias, neto y WR de equilibrio', () => {
    const e = rrEconomy([match(20), match(20), match(-16), match(-16)]);
    expect(e).not.toBeNull();
    expect(e!.avgWin).toBe(20);
    expect(e!.avgLoss).toBe(-16);
    expect(e!.net).toBe(8);
    expect(e!.breakEven).toBeCloseTo(44.444, 2);
  });

  it('devuelve null si solo hay un signo (sin equilibrio posible)', () => {
    expect(rrEconomy([match(20), match(18)])).toBeNull();
    expect(rrEconomy([match(-16), match(-20)])).toBeNull();
  });

  it('ignora partidas sin dato de RR', () => {
    const e = rrEconomy([match(null), match(20), match(-16)]);
    expect(e!.n).toBe(2);
  });
});
