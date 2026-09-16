import { describe, expect, it } from 'vitest';
import { buildTimeline } from './compare';
import type { MatchRow } from './types';

/** Partida base: los tests solo declaran lo que cambia. */
function match(over: Partial<MatchRow>): MatchRow {
  return {
    matchId: 'x',
    date: '',
    timestamp: 0,
    map: 'Ascent',
    agent: 'Jett',
    won: true,
    rounds: 24,
    roundsWon: 13,
    roundsLost: 11,
    kills: 0,
    deaths: 0,
    assists: 0,
    acs: 0,
    adr: 0,
    hsPct: 0,
    tier: 18,
    tierChange: 0,
    durationMin: 0,
    ...over,
  };
}

/** Punto de la serie que corresponde a una partida (por matchId en la clave). */
function pointOf(points: ReturnType<typeof buildTimeline>, matchId: string) {
  return points.find((p) => p.key.endsWith(`-${matchId}`));
}

describe('buildTimeline · métrica RANGO', () => {
  const t1 = Date.parse('2026-09-14T20:00:00Z');
  const t2 = Date.parse('2026-09-14T22:00:00Z');
  const compartida = match({ matchId: 'duo-1', timestamp: t1, tier: 19 });

  it('usa la misma columna para una partida compartida entre jugadores', () => {
    // Alex jugó de todo; Diego solo la compartida y otra más.
    const alex = buildTimeline([compartida, match({ matchId: 'a-2', timestamp: t2 })], 'day', 'rank');
    const diego = buildTimeline([match({ matchId: 'd-0', timestamp: t1 - 86_400_000 }), compartida], 'day', 'rank');
    const keyAlex = pointOf(alex, 'duo-1')?.key;
    const keyDiego = pointOf(diego, 'duo-1')?.key;
    expect(keyAlex).toBeTruthy();
    expect(keyAlex).toBe(keyDiego);
  });

  it('mantiene claves únicas y orden cronológico', () => {
    const points = buildTimeline(
      [match({ matchId: 'b', timestamp: t2 }), match({ matchId: 'a', timestamp: t1 })],
      'day',
      'rank',
    );
    const keys = points.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys[0].endsWith('-a')).toBe(true);
    expect(keys[1].endsWith('-b')).toBe(true);
    expect(points[0].value).toBe(1800);
  });

  it('un punto por partida, también cuando hay varias el mismo día', () => {
    const points = buildTimeline(
      [compartida, match({ matchId: 'a-2', timestamp: t2 })],
      'day',
      'rank',
    );
    expect(points).toHaveLength(2);
    expect(points.every((p) => p.games === 1)).toBe(true);
  });
});
