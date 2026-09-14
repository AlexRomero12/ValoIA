import { describe, expect, it } from 'vitest';
import { computeStats, groupMatches, toStatBlock, type StatMatch } from './stats';

/** Partida base: los tests solo declaran lo que cambia. */
function match(over: Partial<StatMatch>): StatMatch {
  return {
    won: true,
    rounds: 24,
    roundsWon: 13,
    roundsLost: 11,
    kills: 0,
    deaths: 0,
    acs: 0,
    adr: 0,
    hsPct: 0,
    ...over,
  };
}

// Victoria sin crudos (reconstruye score/daño/HS desde ACS/ADR/HS% por ronda).
const WIN_FALLBACK = match({
  won: true,
  rounds: 24,
  roundsWon: 13,
  roundsLost: 11,
  kills: 20,
  deaths: 15,
  acs: 200,
  adr: 150,
  hsPct: 25,
  firstBloods: 3,
  firstDeaths: 2,
});

// Derrota con crudos exactos (score/daño/disparos mandan sobre ACS/ADR/HS%).
const LOSS_RAW = match({
  won: false,
  rounds: 20,
  roundsWon: 8,
  roundsLost: 12,
  kills: 10,
  deaths: 16,
  acs: 100,
  adr: 100,
  hsPct: 20,
  score: 3000,
  damageDealt: 2500,
  headshots: 40,
  shots: 100,
  firstBloods: 1,
  firstDeaths: 4,
});

// Empate 13-13: no cuenta como decisiva.
const DRAW = match({
  won: false,
  rounds: 26,
  roundsWon: 13,
  roundsLost: 13,
  kills: 15,
  deaths: 15,
  acs: 150,
  adr: 120,
  hsPct: 30,
  firstBloods: 2,
  firstDeaths: 2,
});

describe('computeStats', () => {
  it('agrega V-D-E y excluye los empates del WR', () => {
    const s = computeStats([WIN_FALLBACK, LOSS_RAW, DRAW]);
    expect(s.games).toBe(3);
    expect(s.wins).toBe(1);
    expect(s.losses).toBe(1);
    expect(s.draws).toBe(1);
    expect(s.wr).toBe(50);
  });

  it('usa totales crudos cuando existen y reconstruye por rondas cuando no', () => {
    const s = computeStats([WIN_FALLBACK, LOSS_RAW, DRAW]);
    // score = 200·24 + 3000 + 150·26 = 11700 sobre 70 rondas (redondeado).
    expect(s.acs).toBe(Math.round(11700 / 70));
    // daño = 150·24 + 2500 + 120·26 = 9220 sobre 70 rondas (redondeado).
    expect(s.adr).toBe(Math.round(9220 / 70));
    // HS directo al haber crudos: 40/100.
    expect(s.hsPct).toBe(40);
    expect(s.kd).toBeCloseTo(45 / 46, 6);
  });

  it('promedia FB/FD por partida (0 si falta el dato)', () => {
    const s = computeStats([WIN_FALLBACK, LOSS_RAW, DRAW]);
    expect(s.fb).toBeCloseTo(2, 6);
    expect(s.fd).toBeCloseTo(8 / 3, 6);
  });

  it('cae al HS% ponderado por rondas cuando no hay crudos de disparos', () => {
    const a = match({ rounds: 10, hsPct: 20 });
    const b = match({ rounds: 30, hsPct: 40 });
    const s = computeStats([a, b]);
    // (20·10 + 40·30) / 40 = 35.
    expect(s.hsPct).toBeCloseTo(35, 6);
  });

  it('sin partidas devuelve ceros y sin impacto', () => {
    const s = computeStats([]);
    expect(s).toMatchObject({ games: 0, wins: 0, losses: 0, draws: 0, wr: 0, kd: 0, acs: 0, adr: 0, hsPct: 0 });
    expect(s.fb).toBeUndefined();
    expect(s.fd).toBeUndefined();
  });
});

describe('groupMatches', () => {
  it('agrupa por clave preservando el orden de aparición', () => {
    const groups = groupMatches([match({ kills: 1 }), match({ kills: 2 }), match({ kills: 3 })], (m) => (m.kills >= 3 ? 'b' : 'a'));
    expect([...groups.keys()]).toEqual(['a', 'b']);
    expect(groups.get('a')).toHaveLength(2);
    expect(groups.get('b')).toHaveLength(1);
  });
});

describe('toStatBlock', () => {
  it('renombra games a matches y omite el impacto', () => {
    const s = computeStats([WIN_FALLBACK, LOSS_RAW, DRAW]);
    expect(toStatBlock(s)).toEqual({
      matches: 3,
      wins: 1,
      draws: 1,
      wr: 50,
      kd: s.kd,
      acs: s.acs,
      adr: s.adr,
      hsPct: 40,
    });
  });
});
