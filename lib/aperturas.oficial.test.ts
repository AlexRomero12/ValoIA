import { describe, expect, it } from 'vitest';
import { computeAperturas, matchAperturas, sidesByRoundDetailed } from './aperturas';
import type { HenrikKill, HenrikMatch, HenrikMatchRound } from './henrik';

/**
 * Cobertura del dato OFICIAL de Riot que llegó con el match v4 de v4.10:
 *  - `rounds[].first_blood` (killer de la primera kill de la ronda).
 *  - `rounds[].winning_team_role` (bando del equipo ganador).
 *
 * Lo que se comprueba aquí:
 *  1. El bando oficial manda sobre las plantas y sobre la propagación por mitades.
 *  2. El FB sale del dato oficial cuando existe y del kill feed cuando no.
 *  3. La FD sigue saliendo del kill feed (Riot no publica la víctima).
 *  4. La auditoría cuenta coincidencias y discrepancias.
 */

const ME = 'me';
const BLUE = { puuid: ME, team: 'Blue' };
const RED = { puuid: 'enemy', team: 'Red' };

function mkRound(
  id: number,
  winner: string | null,
  planter: string | null,
  opts: { role?: string | null; fb?: string | null } = {},
): HenrikMatchRound {
  return {
    id,
    winning_team: winner,
    winning_team_role: opts.role ?? null,
    first_blood: opts.fb ? { puuid: opts.fb, name: opts.fb, tag: 'X', team: opts.fb === ME ? 'Blue' : 'Red' } : null,
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

function mkMatch(rounds: HenrikMatchRound[], kills: HenrikKill[] = []): HenrikMatch {
  return {
    metadata: {
      match_id: 'm1',
      map: { name: 'Ascent' },
      started_at: '2026-10-06T12:00:00Z',
      is_completed: true,
      queue: { id: 'competitive' },
      season: { short: 'e11a5' },
    },
    players: [
      { puuid: ME, name: 'Alex', tag: 'LAN', team_id: 'Blue', agent: { name: 'Jett' } },
      { puuid: 'enemy', name: 'Enemy', tag: '0002', team_id: 'Red' },
    ],
    teams: [
      { team_id: 'Blue', won: true },
      { team_id: 'Red', won: false },
    ],
    kills,
    rounds,
  };
}

describe('bando oficial (winning_team_role)', () => {
  it('deduce mi bando invirtiendo el del ganador', () => {
    // Ganó Red atacando => mi equipo (Blue) defendía.
    const { side, official } = sidesByRoundDetailed(
      mkMatch([mkRound(0, 'Red', null, { role: 'Attacker' })]),
      'Blue',
    );
    expect(side.get(0)).toBe(0);
    expect(official.has(0)).toBe(true);
  });

  it('cuando gano yo, el rol es el de mi equipo', () => {
    const { side } = sidesByRoundDetailed(mkMatch([mkRound(3, 'Blue', null, { role: 'Defender' })]), 'Blue');
    expect(side.get(3)).toBe(0);
  });

  it('el dato oficial manda sobre la planta de esa ronda', () => {
    // La planta dice que planté yo (ATK), pero Riot dice que Blue defendía.
    const { side, official } = sidesByRoundDetailed(
      mkMatch([mkRound(2, 'Red', 'Blue', { role: 'Attacker' })]),
      'Blue',
    );
    expect(side.get(2)).toBe(0);
    expect(official.has(2)).toBe(true);
  });

  it('sin dato oficial cae a las plantas (comportamiento de siempre)', () => {
    const { side, official } = sidesByRoundDetailed(mkMatch([mkRound(2, 'Red', 'Blue')]), 'Blue');
    expect(side.get(2)).toBe(1);
    expect(official.size).toBe(0);
  });

  it('no pisa las rondas oficiales al propagar por mitades', () => {
    // Ronda 0 oficial (DEF) y ronda 5 oficial (ATK): datos raros pero reales
    // (p. ej. cambio de lado a mitad de acto): deben sobrevivir a la mitad.
    const { side } = sidesByRoundDetailed(
      mkMatch([
        mkRound(0, 'Red', null, { role: 'Attacker' }), // Blue DEF
        mkRound(5, 'Blue', null, { role: 'Attacker' }), // Blue ATK
      ]),
      'Blue',
    );
    expect(side.get(0)).toBe(0);
    expect(side.get(5)).toBe(1);
  });
});

describe('first blood oficial', () => {
  it('usa el FB oficial cuando el kill feed no tiene la kill', () => {
    const m = mkMatch([mkRound(0, 'Blue', null, { fb: ME })], []);
    const a = matchAperturas(m, ME);
    expect(a?.total.fb).toBe(1);
    expect(a?.total.rounds).toBe(1);
  });

  it('la FD sigue saliendo del kill feed', () => {
    const m = mkMatch([mkRound(0, 'Red', null, { fb: RED.puuid })], [mkKill(0, 5000, RED, BLUE)]);
    const a = matchAperturas(m, ME);
    expect(a?.total.fd).toBe(1);
    expect(a?.total.fb).toBe(0);
  });

  it('cuenta coincidencias y discrepancias contra el kill feed', () => {
    const rounds = [
      mkRound(0, 'Blue', null, { fb: ME, role: 'Defender' }),
      mkRound(1, 'Blue', null, { fb: ME, role: 'Defender' }),
    ];
    // Ronda 0: el kill feed dice lo mismo (mi kill). Ronda 1: dice otra cosa.
    const kills = [mkKill(0, 4000, BLUE, RED), mkKill(1, 4000, RED, BLUE)];
    const a = computeAperturas([mkMatch(rounds, kills)], ME);
    expect(a?.verificacion).toEqual({ rounds: 2, official: 2, agree: 1, mismatch: 1, sideOfficial: 2 });
  });

  it('las rondas sin dato oficial no entran en la auditoría', () => {
    const rounds = [mkRound(0, 'Blue', 'Blue'), mkRound(1, 'Blue', null, { fb: ME, role: 'Attacker' })];
    const kills = [mkKill(0, 4000, BLUE, RED), mkKill(1, 4000, BLUE, RED)];
    const a = computeAperturas([mkMatch(rounds, kills)], ME);
    expect(a?.verificacion?.rounds).toBe(2);
    expect(a?.verificacion?.official).toBe(1);
    expect(a?.verificacion?.agree).toBe(1);
    expect(a?.verificacion?.mismatch).toBe(0);
    expect(a?.verificacion?.sideOfficial).toBe(1);
  });

  it('etiqueta cada partida con sus rondas oficiales', () => {
    const rounds = [mkRound(0, 'Blue', null, { fb: ME, role: 'Defender' }), mkRound(1, 'Blue', 'Blue')];
    const a = computeAperturas([mkMatch(rounds, [mkKill(0, 4000, BLUE, RED)])], ME);
    expect(a?.matches[0].fbOfficial).toBe(1);
    expect(a?.matches[0].sideOfficial).toBe(1);
  });
});
