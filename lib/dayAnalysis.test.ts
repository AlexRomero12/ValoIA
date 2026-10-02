import { describe, expect, it } from 'vitest';
import { dayStats, groupByDay } from './dayAnalysis';
import type { MatchRow } from './types';

const DAY = new Date('2026-01-15T12:00:00').getTime();

function match(rrDelta: number | null, timestamp: number): MatchRow {
  return {
    matchId: `m${timestamp}-${rrDelta}`,
    date: new Date(timestamp).toISOString(),
    timestamp,
    map: 'Ascent',
    agent: 'Jett',
    won: rrDelta != null && rrDelta > 0,
    rounds: 20,
    roundsWon: 13,
    roundsLost: 7,
    kills: 10,
    deaths: 10,
    assists: 2,
    acs: 200,
    adr: 140,
    hsPct: 20,
    tier: 18,
    tierChange: 0,
    durationMin: 30,
    rrDelta,
  };
}

describe('dayStats con snapshot guardado', () => {
  it('usa el neto guardado cuando faltan rrDelta', () => {
    const [g] = groupByDay([match(20, DAY), match(null, DAY + 1000), match(null, DAY + 2000)]);
    const s = dayStats(g, -5);
    expect(s.rrFromStore).toBe(true);
    expect(s.rrTotal).toBe(-5);
    expect(s.rrMissing).toBe(0);
  });

  it('ignora el snapshot si el día tiene RR completo', () => {
    const [g] = groupByDay([match(20, DAY), match(-10, DAY + 1000)]);
    const s = dayStats(g, 99);
    expect(s.rrFromStore).toBeFalsy();
    expect(s.rrTotal).toBe(10);
    expect(s.rrMissing).toBe(0);
  });

  it('sin snapshot mantiene el neto parcial', () => {
    const [g] = groupByDay([match(20, DAY), match(null, DAY + 1000)]);
    const s = dayStats(g);
    expect(s.rrFromStore).toBeFalsy();
    expect(s.rrTotal).toBe(20);
    expect(s.rrMissing).toBe(1);
  });
});
