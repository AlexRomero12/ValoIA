import { describe, expect, it } from 'vitest';
import { computeAperturas, matchAperturas, sidesByRound } from './aperturas';
import { mergeAperturas } from './compare';
import type { HenrikKill, HenrikMatch, HenrikMatchRound } from './henrik';

const ME = 'me';
const BLUE = { puuid: ME, team: 'Blue' };
const RED = { puuid: 'enemy', team: 'Red' };

function mkRound(id: number, winner: string | null, planter: string | null): HenrikMatchRound {
  return {
    id,
    winning_team: winner,
    plant: planter ? { site: 'A', player: { name: 'p', puuid: 'p', team: planter } } : null,
  };
}

function mkKill(round: number, t: number, killer: typeof BLUE, victim: typeof BLUE): HenrikKill {
  return {
    round,
    time_in_round_in_ms: t,
    killer: { ...killer, name: killer.puuid },
    victim: { ...victim, name: victim.puuid },
    weapon: { name: 'Vandal' },
  };
}

function mkMatch(opts: {
  id?: string;
  map?: string;
  agent?: string;
  won?: boolean;
  rounds: HenrikMatchRound[];
  kills?: HenrikKill[];
}): HenrikMatch {
  const won = opts.won ?? true;
  return {
    metadata: {
      match_id: opts.id ?? 'm1',
      map: { name: opts.map ?? 'Ascent' },
      started_at: '2026-09-01T12:00:00Z',
      is_completed: true,
      queue: { id: 'competitive' },
      season: { short: 'e11a5' },
    },
    players: [
      { puuid: ME, name: 'Alex', tag: 'LAN', team_id: 'Blue', agent: { name: opts.agent ?? 'Jett' } },
      { puuid: 'mate', name: 'Mate', tag: '0001', team_id: 'Blue' },
      { puuid: 'enemy', name: 'Enemy', tag: '0002', team_id: 'Red' },
    ],
    teams: [
      { team_id: 'Blue', won },
      { team_id: 'Red', won: !won },
    ],
    kills: opts.kills ?? [],
    rounds: opts.rounds,
  };
}

describe('sidesByRound', () => {
  it('infiere ATK/DEF por planta y propaga la mitad opuesta', () => {
    // Primera mitad con planta de Blue (mi equipo ataca); segunda sin planta.
    const m = mkMatch({
      rounds: [mkRound(0, 'Blue', 'Blue'), mkRound(1, 'Blue', null), mkRound(12, 'Blue', null), mkRound(13, 'Red', null)],
    });
    const sides = sidesByRound(m, 'Blue');
    expect(sides.get(0)).toBe(1);
    expect(sides.get(11)).toBe(1);
    expect(sides.get(12)).toBe(0);
    expect(sides.get(13)).toBe(0);
  });

  it('alterna bandos en OT a partir del bando de la segunda mitad', () => {
    const rounds = [mkRound(0, 'Blue', 'Red'), mkRound(13, 'Blue', null), mkRound(24, 'Blue', null), mkRound(25, 'Blue', null)];
    const sides = sidesByRound(mkMatch({ rounds }), 'Blue');
    // Planta de Red => yo DEF en la 1.ª mitad; 2.ª = ATK; OT: r24 DEF, r25 ATK.
    expect(sides.get(0)).toBe(0);
    expect(sides.get(13)).toBe(1);
    expect(sides.get(24)).toBe(0);
    expect(sides.get(25)).toBe(1);
  });

  it('deja sin bando las rondas cuando no hay plantas', () => {
    const m = mkMatch({ rounds: [mkRound(0, 'Blue', null), mkRound(1, 'Red', null)] });
    expect(sidesByRound(m, 'Blue').size).toBe(0);
  });
});

describe('computeAperturas', () => {
  // 6 rondas: ids 0-3 (ATK, planta de Blue) y 12-13 (DEF, planta de Red).
  const rounds = [
    mkRound(0, 'Blue', 'Blue'),
    mkRound(1, 'Red', null),
    mkRound(2, 'Red', null),
    mkRound(3, 'Blue', null),
    mkRound(12, 'Blue', null),
    mkRound(13, 'Red', null),
  ];
  const kills = [
    mkKill(0, 1000, BLUE, RED), // FB y victoria
    mkKill(1, 500, RED, BLUE), // FD y derrota
    mkKill(2, 400, BLUE, RED), // FB sin convertir (muero después: no cuenta como FD)
    mkKill(2, 800, RED, BLUE),
    mkKill(12, 200, RED, BLUE), // FD en DEF, pero ganamos la ronda
    mkKill(13, 100, BLUE, RED), // FB sin convertir
  ];

  it('cuenta FB/FD, conversión y reparto por bando', () => {
    const a = computeAperturas([mkMatch({ rounds, kills })], ME);
    expect(a).toBeTruthy();
    if (!a) return;
    expect(a.total.rounds).toBe(6);
    expect(a.total.fd).toBe(2);
    expect(a.total.fdWon).toBe(1);
    expect(a.total.noFd).toBe(4);
    expect(a.total.noFdWon).toBe(2);
    expect(a.total.fb).toBe(3);
    expect(a.total.fbWon).toBe(1);
    expect(a.total.fbLost).toBe(2);
    expect(a.sinLado).toBe(0);

    expect(a.atk.rounds).toBe(4);
    expect(a.atk.fd).toBe(1);
    expect(a.atk.fdWon).toBe(0);
    expect(a.atk.fb).toBe(2);
    expect(a.atk.fbWon).toBe(1);
    expect(a.atk.fbLost).toBe(1);

    expect(a.def.rounds).toBe(2);
    expect(a.def.fd).toBe(1);
    expect(a.def.fdWon).toBe(1);
    expect(a.def.fb).toBe(1);
    expect(a.def.fbLost).toBe(1);
  });

  it('agrupa por mapa y agente y arma la fila de revisión', () => {
    const a = computeAperturas([mkMatch({ rounds, kills })], ME);
    if (!a) throw new Error('sin aperturas');
    expect(a.byMap.map((g) => g.name)).toEqual(['Ascent']);
    expect(a.byAgent.map((g) => g.name)).toEqual(['Jett']);
    expect(a.byMap[0].total.rounds).toBe(6);
    // Denominadores de FD/part.: el partido tiene rondas de ambos bandos.
    expect(a.byMap[0].atkMatches).toBe(1);
    expect(a.byMap[0].defMatches).toBe(1);
    expect(a.byAgent[0].atkMatches).toBe(1);
    expect(a.byAgent[0].defMatches).toBe(1);
    expect(a.matches).toHaveLength(1);
    expect(a.matches[0]).toMatchObject({ matchId: 'm1', map: 'Ascent', agent: 'Jett', fd: 2, fb: 3, fbLost: 2 });
  });

  it('las rondas sin bando cuentan en total y sinLado, no en ATK/DEF', () => {
    const sinPlantas = [mkRound(0, 'Blue', null), mkRound(1, 'Red', null), mkRound(2, 'Blue', null)];
    const a = computeAperturas([mkMatch({ rounds: sinPlantas, kills: [mkKill(0, 1000, BLUE, RED)] })], ME);
    if (!a) throw new Error('sin aperturas');
    expect(a.total.rounds).toBe(3);
    expect(a.sinLado).toBe(3);
    expect(a.atk.rounds).toBe(0);
    expect(a.def.rounds).toBe(0);
    expect(a.byMap[0].atkMatches).toBe(0);
    expect(a.byMap[0].defMatches).toBe(0);
    expect(a.total.fb).toBe(1);
    expect(a.matches[0].sideUnknown).toBe(3);
  });

  it('devuelve undefined sin partidas utilizables', () => {
    expect(computeAperturas([mkMatch({ rounds: [] })], ME)).toBeUndefined();
    // Miembro sin equipo identificable: se omite la partida.
    const sinEquipo = mkMatch({ rounds: [mkRound(0, 'Blue', 'Blue')] });
    sinEquipo.players = [{ puuid: ME }];
    expect(computeAperturas([sinEquipo], ME)).toBeUndefined();
  });
});

describe('matchAperturas', () => {
  // Mismas 6 rondas que computeAperturas: ids 0-3 (ATK) y 12-13 (DEF).
  const rounds = [
    mkRound(0, 'Blue', 'Blue'),
    mkRound(1, 'Red', null),
    mkRound(2, 'Red', null),
    mkRound(3, 'Blue', null),
    mkRound(12, 'Blue', null),
    mkRound(13, 'Red', null),
  ];
  const kills = [
    mkKill(0, 1000, BLUE, RED), // FB (ATK)
    mkKill(1, 500, RED, BLUE), // FD (ATK)
    mkKill(2, 400, BLUE, RED), // FB (ATK)
    mkKill(2, 800, RED, BLUE),
    mkKill(12, 200, RED, BLUE), // FD (DEF)
    mkKill(13, 100, BLUE, RED), // FB (DEF)
  ];

  it('separa FB/FD por bando manteniendo el total', () => {
    const a = matchAperturas(mkMatch({ rounds, kills }), ME);
    if (!a) throw new Error('sin aperturas');
    expect(a.rounds).toBe(6);
    expect(a.sinLado).toBe(0);
    expect(a.total.fb).toBe(3);
    expect(a.total.fd).toBe(2);
    expect(a.atk.rounds).toBe(4);
    expect(a.atk.fb).toBe(2);
    expect(a.atk.fd).toBe(1);
    expect(a.def.rounds).toBe(2);
    expect(a.def.fb).toBe(1);
    expect(a.def.fd).toBe(1);
  });

  it('las rondas sin planta quedan en sinLado y fuera de ATK/DEF', () => {
    const sinPlantas = [mkRound(0, 'Blue', null), mkRound(1, 'Red', null)];
    const a = matchAperturas(mkMatch({ rounds: sinPlantas, kills: [mkKill(0, 1000, BLUE, RED)] }), ME);
    if (!a) throw new Error('sin aperturas');
    expect(a.sinLado).toBe(2);
    expect(a.atk.rounds).toBe(0);
    expect(a.def.rounds).toBe(0);
    expect(a.total.fb).toBe(1);
  });

  it('null sin equipo identificable ni rondas', () => {
    expect(matchAperturas(mkMatch({ rounds: [] }), ME)).toBeNull();
    const sinEquipo = mkMatch({ rounds: [mkRound(0, 'Blue', 'Blue')] });
    sinEquipo.players = [{ puuid: ME }];
    expect(matchAperturas(sinEquipo, ME)).toBeNull();
  });
});

describe('mergeAperturas', () => {
  const roundsA = [mkRound(0, 'Blue', 'Blue'), mkRound(1, 'Red', null)];
  const roundsB = [mkRound(0, 'Blue', 'Blue'), mkRound(1, 'Blue', null), mkRound(2, 'Red', null)];

  it('suma buckets y unifica grupos de varias cuentas', () => {
    const a = computeAperturas([mkMatch({ id: 'm1', rounds: roundsA })], ME);
    const b = computeAperturas([mkMatch({ id: 'm2', rounds: roundsB })], ME);
    if (!a || !b) throw new Error('sin aperturas');
    const merged = mergeAperturas([a, b]);
    if (!merged) throw new Error('sin merge');
    expect(merged.total.rounds).toBe(2 + 3);
    expect(merged.byMap).toHaveLength(1);
    expect(merged.byMap[0].total.rounds).toBe(5);
    // Ambos partidos tienen rondas de ataque (primera mitad); ninguno de defensa.
    expect(merged.byMap[0].atkMatches).toBe(2);
    expect(merged.byMap[0].defMatches).toBe(0);
    expect(merged.matches.map((p) => p.matchId).sort()).toEqual(['m1', 'm2']);
  });

  it('deduplica la lista de partidas por matchId', () => {
    const a = computeAperturas([mkMatch({ id: 'm1', rounds: roundsA })], ME);
    const b = computeAperturas([mkMatch({ id: 'm1', rounds: roundsB })], ME);
    if (!a || !b) throw new Error('sin aperturas');
    const merged = mergeAperturas([a, b]);
    if (!merged) throw new Error('sin merge');
    expect(merged.matches).toHaveLength(1);
  });

  it('sin datos devuelve undefined', () => {
    expect(mergeAperturas([])).toBeUndefined();
  });
});
