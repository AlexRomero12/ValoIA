import { describe, expect, it } from 'vitest';
import { placementStats, teamSizeOf } from './placement';
import type { MatchRow } from './types';

function match(over: Partial<MatchRow>): MatchRow {
  return {
    matchId: 'x',
    date: '',
    timestamp: 0,
    map: 'Ascent',
    agent: 'Jett',
    won: true,
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
    ...over,
  };
}

const mates4 = ['a#1', 'b#2', 'c#3', 'd#4'];

describe('teamSizeOf', () => {
  it('infiere el tamaño del equipo desde los compañeros', () => {
    expect(teamSizeOf(match({ mates: mates4 }))).toBe(5);
    expect(teamSizeOf(match({}))).toBeNull();
  });
});

describe('placementStats', () => {
  it('calcula puesto medio, % último y bottom-2', () => {
    const ms = [
      match({ teamRank: 5, lobbyRank: 9, mates: mates4 }),
      match({ teamRank: 4, lobbyRank: 7, mates: mates4 }),
      match({ teamRank: 1, lobbyRank: 2, mates: mates4 }),
    ];
    const s = placementStats(ms);
    expect(s.games).toBe(3);
    expect(s.avgTeam).toBeCloseTo(10 / 3);
    expect(s.avgLobby).toBeCloseTo(6);
    expect(s.lastPct).toBeCloseTo(33.333, 2);
    expect(s.bottom2Pct).toBeCloseTo(66.667, 2);
  });

  it('WR cuando es último vs cuando es top-2', () => {
    const ms = [
      match({ teamRank: 5, mates: mates4, won: true }),
      match({ teamRank: 5, mates: mates4, won: false }),
      match({ teamRank: 1, mates: mates4, won: false }),
      match({ teamRank: 2, mates: mates4, won: true }),
    ];
    const s = placementStats(ms);
    expect(s.wrWhenLast).toBe(50);
    expect(s.wrWhenTop2).toBe(50);
  });

  it('ignora equipos incompletos (<3) y partidas sin dato', () => {
    const ms = [
      match({ teamRank: 5, mates: ['a#1'] }), // tamaño 2 → fuera
      match({ mates: mates4 }), // sin teamRank → fuera
      match({ teamRank: 3, mates: mates4 }),
    ];
    const s = placementStats(ms);
    expect(s.games).toBe(1);
    expect(s.avgTeam).toBe(3);
    expect(s.lastPct).toBe(0);
  });

  it('% bajo la media del equipo usa mateAcs', () => {
    const ms = [
      match({ acs: 150, mateAcs: 200 }),
      match({ acs: 220, mateAcs: 200 }),
      match({ acs: 180 }), // sin mateAcs → fuera del denominador
    ];
    const s = placementStats(ms);
    expect(s.belowAvgGames).toBe(2);
    expect(s.belowAvgPct).toBe(50);
  });
});
