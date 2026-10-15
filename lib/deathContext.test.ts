import { describe, expect, it, vi } from 'vitest';
import type { HenrikMatch, HenrikMatchRound } from './henrik';

/**
 * El módulo pide los diccionarios de contenido y la ficha del mapa (callouts).
 * Se sustituyen por un mapa de prueba con dos zonas para poder afirmar dónde
 * cae cada muerte sin salir a la red.
 */
vi.mock('./valorant', () => ({
  getContent: async () => ({ agents: {}, maps: {}, mapByUuid: {}, weapons: {}, abilities: {} }),
  getMapInfo: async () => ({
    name: 'Testland',
    icon: null,
    uuid: 'test',
    calibration: null,
    callouts: [
      { name: 'Main', area: 'A', x: 1000, y: 0 },
      { name: 'Site', area: 'B', x: -3000, y: 0 },
    ],
  }),
}));

const { angleDiffDeg, buildDeathReport, calloutLabel, dist2d, nearestCallout } = await import('./deathContext');

const CALLOUTS = [
  { name: 'Main', area: 'A', x: 1000, y: 0 },
  { name: 'Site', area: 'B', x: -3000, y: 0 },
];

describe('dist2d / angleDiffDeg · geometría base', () => {
  it('mide distancias en el plano', () => {
    expect(dist2d({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('normaliza la diferencia de ángulos a (-180, 180]', () => {
    expect(angleDiffDeg(10, 350)).toBe(20);
    expect(angleDiffDeg(350, 10)).toBe(-20);
    expect(angleDiffDeg(0, 180)).toBe(180);
    expect(angleDiffDeg(90, 0)).toBe(90);
  });

  it('un ángulo y su vuelta completa son el mismo rumbo', () => {
    expect(angleDiffDeg(725, 5)).toBe(0);
  });
});

describe('nearestCallout / calloutLabel · dónde caigo', () => {
  it('elige la zona más cercana', () => {
    expect(nearestCallout(CALLOUTS, 1100, 50)?.name).toBe('Main');
    expect(nearestCallout(CALLOUTS, -2900, 0)?.name).toBe('Site');
  });

  it('sin zonas devuelve null en vez de inventarse una', () => {
    expect(nearestCallout([], 0, 0)).toBeNull();
    expect(nearestCallout(undefined, 0, 0)).toBeNull();
  });

  it('compone la etiqueta con la zona padre', () => {
    expect(calloutLabel({ name: 'Site', area: 'A', x: 0, y: 0 })).toEqual({ zone: 'A Site', area: 'A' });
  });

  it('no repite la zona padre si el nombre ya la lleva', () => {
    expect(calloutLabel({ name: 'A Main', area: 'A', x: 0, y: 0 }).zone).toBe('A Main');
  });

  it('sin callout no hay etiqueta', () => {
    expect(calloutLabel(null)).toEqual({ zone: null, area: null });
  });
});

/** Partida mínima: yo (Blue), un compañero y un rival (Red). */
function match(overrides: {
  kills: HenrikMatch['kills'];
  plant?: HenrikMatchRound['plant'];
  myLoadout?: number;
  killerLoadout?: number;
}): HenrikMatch {
  return {
    metadata: { match_id: 'm1', map: { name: 'Testland', id: 'test' }, is_completed: true },
    players: [
      { puuid: 'me', name: 'Yo', team_id: 'Blue', agent: { name: 'Jett' } },
      { puuid: 'mate', name: 'Mate', team_id: 'Blue', agent: { name: 'Sova' } },
      { puuid: 'rival', name: 'Rival', team_id: 'Red', agent: { name: 'Reyna' } },
    ],
    rounds: [
      {
        id: 0,
        result: 'Elimination',
        winning_team: 'Red',
        plant: overrides.plant ?? null,
        stats: [
          { player: { puuid: 'me', team: 'Blue' }, economy: { loadout_value: overrides.myLoadout ?? 1000 } },
          { player: { puuid: 'rival', team: 'Red' }, economy: { loadout_value: overrides.killerLoadout ?? 3000 } },
        ],
      },
    ],
    kills: overrides.kills,
  };
}

function loc(x: number, y: number, puuid: string, team: string, viewRad: number) {
  return { player: { puuid, team }, location: { x, y }, view_radians: viewRad };
}

describe('buildDeathReport · cómo y dónde muero', () => {
  it('sitúa la muerte en su zona y marca las señales que ve', async () => {
    // El rival me mata a 300u, mirándome, sin nadie cerca y sin trade, y con el
    // spike ya plantado por mi equipo: apertura + solo + sin trade + corto +
    // post-plant + desventaja de economía.
    const report = await buildDeathReport(
      [
        {
          puuid: 'me',
          matches: [
            {
              matchId: 'm1',
              startedAt: Date.parse('2026-10-14T20:00:00Z'),
              match: match({
                plant: { round_time_in_ms: 15_000, site: 'A', player: { puuid: 'me', team: 'Blue' } },
                kills: [
                  {
                    round: 0,
                    time_in_round_in_ms: 20_000,
                    killer: { puuid: 'rival', name: 'Rival', team: 'Red' },
                    victim: { puuid: 'me', name: 'Yo', team: 'Blue' },
                    weapon: { name: 'Vandal', type: 'Weapon' },
                    location: { x: 1100, y: 50 },
                    player_locations: [
                      loc(1400, 50, 'rival', 'Red', Math.PI),
                      loc(-4000, 0, 'mate', 'Blue', 0),
                    ],
                  },
                ],
              }),
            },
          ],
        },
      ],
      'alex',
      { from: '2026-10-14', to: '2026-10-14' },
    );

    expect(report.deaths).toBe(1);
    const spot = report.spots[0];
    expect(spot.zone).toBe('A Main');
    expect(spot.area).toBe('A');
    expect(spot.weapon).toBe('Vandal');
    expect(spot.dist).toBe(300);
    expect(spot.facing).toBe(true);
    expect(spot.matesNear).toBe(0);
    expect(spot.enemiesNear).toBe(1);
    expect(spot.opening).toBe(true);
    expect(spot.traded).toBe(false);
    expect(spot.spike).toBe('mine');
    expect(spot.tags).toEqual(
      expect.arrayContaining(['apertura', 'solo', 'sin-trade', 'cuerpo-a-cuerpo', 'post-plant', 'eco-desfavorable']),
    );
    // No aplica: un solo rival cerca, arma normal y duelo corto.
    expect(spot.tags).not.toContain('rodeado');
    expect(spot.tags).not.toContain('habilidad');
    expect(spot.tags).not.toContain('a-distancia');
    expect(spot.tags).not.toContain('de-espaldas');
  });

  it('marca «de-espaldas» si el asesino no miraba hacia mí', async () => {
    const report = await buildDeathReport(
      [
        {
          puuid: 'me',
          matches: [
            {
              matchId: 'm1',
              startedAt: 0,
              match: match({
                kills: [
                  {
                    round: 0,
                    time_in_round_in_ms: 20_000,
                    killer: { puuid: 'rival', name: 'Rival', team: 'Red' },
                    victim: { puuid: 'me', name: 'Yo', team: 'Blue' },
                    weapon: { name: 'Vandal', type: 'Weapon' },
                    location: { x: 1100, y: 50 },
                    // Mira al lado contrario (0 rad = +x) mientras yo estoy en -x.
                    player_locations: [loc(1400, 50, 'rival', 'Red', 0)],
                  },
                ],
              }),
            },
          ],
        },
      ],
      'alex',
      { from: '2026-10-14', to: '2026-10-14' },
    );
    expect(report.spots[0].facing).toBe(false);
    expect(report.spots[0].tags).toContain('de-espaldas');
  });

  it('marca «rodeado» con más rivales que compañeros cerca', async () => {
    const report = await buildDeathReport(
      [
        {
          puuid: 'me',
          matches: [
            {
              matchId: 'm1',
              startedAt: 0,
              match: match({
                kills: [
                  {
                    round: 0,
                    time_in_round_in_ms: 20_000,
                    killer: { puuid: 'rival', name: 'Rival', team: 'Red' },
                    victim: { puuid: 'me', name: 'Yo', team: 'Blue' },
                    weapon: { name: 'Vandal', type: 'Weapon' },
                    location: { x: 1100, y: 50 },
                    player_locations: [
                      loc(1400, 50, 'rival', 'Red', Math.PI),
                      loc(1300, 100, 'rival2', 'Red', Math.PI),
                      loc(1200, 120, 'rival3', 'Red', Math.PI),
                      loc(1250, 80, 'mate', 'Blue', 0),
                    ],
                  },
                ],
              }),
            },
          ],
        },
      ],
      'alex',
      { from: '2026-10-14', to: '2026-10-14' },
    );
    expect(report.spots[0].enemiesNear).toBe(3);
    expect(report.spots[0].matesNear).toBe(1);
    expect(report.spots[0].tags).toContain('rodeado');
    expect(report.spots[0].tags).not.toContain('solo');
  });

  it('marca el trade cuando un compañero mata al asesino después', async () => {
    const report = await buildDeathReport(
      [
        {
          puuid: 'me',
          matches: [
            {
              matchId: 'm1',
              startedAt: 0,
              match: match({
                kills: [
                  {
                    round: 0,
                    time_in_round_in_ms: 20_000,
                    killer: { puuid: 'rival', name: 'Rival', team: 'Red' },
                    victim: { puuid: 'me', name: 'Yo', team: 'Blue' },
                    weapon: { name: 'Vandal', type: 'Weapon' },
                    location: { x: 1100, y: 50 },
                    player_locations: [loc(1400, 50, 'rival', 'Red', Math.PI)],
                  },
                  {
                    round: 0,
                    time_in_round_in_ms: 23_000,
                    killer: { puuid: 'mate', name: 'Mate', team: 'Blue' },
                    victim: { puuid: 'rival', name: 'Rival', team: 'Red' },
                    weapon: { name: 'Phantom', type: 'Weapon' },
                  },
                ],
              }),
            },
          ],
        },
      ],
      'alex',
      { from: '2026-10-14', to: '2026-10-14' },
    );
    expect(report.spots[0].traded).toBe(true);
    expect(report.spots[0].tags).not.toContain('sin-trade');
  });

  it('una muerte a habilidad se etiqueta como tal', async () => {
    const report = await buildDeathReport(
      [
        {
          puuid: 'me',
          matches: [
            {
              matchId: 'm1',
              startedAt: 0,
              match: match({
                kills: [
                  {
                    round: 0,
                    time_in_round_in_ms: 20_000,
                    killer: { puuid: 'rival', name: 'Rival', team: 'Red' },
                    victim: { puuid: 'me', name: 'Yo', team: 'Blue' },
                    weapon: { name: 'Blade Storm', type: 'Ability' },
                    location: { x: 1100, y: 50 },
                    player_locations: [loc(1400, 50, 'rival', 'Red', Math.PI)],
                  },
                ],
              }),
            },
          ],
        },
      ],
      'alex',
      { from: '2026-10-14', to: '2026-10-14' },
    );
    expect(report.spots[0].weaponKind).toBe('ability');
    expect(report.spots[0].tags).toContain('habilidad');
  });

  it('agrega por zona, arma y asesino', async () => {
    const kill = (t: number) => ({
      round: 0,
      time_in_round_in_ms: t,
      killer: { puuid: 'rival', name: 'Rival', team: 'Red' },
      victim: { puuid: 'me', name: 'Yo', team: 'Blue' },
      weapon: { name: 'Vandal', type: 'Weapon' },
      location: { x: 1100, y: 50 },
      player_locations: [loc(1400, 50, 'rival', 'Red', Math.PI)],
    });
    const report = await buildDeathReport(
      [
        {
          puuid: 'me',
          matches: [
            { matchId: 'm1', startedAt: 0, match: match({ kills: [kill(20_000)] }) },
            { matchId: 'm2', startedAt: 0, match: match({ kills: [kill(25_000)] }) },
          ],
        },
      ],
      'alex',
      { from: '2026-10-14', to: '2026-10-14' },
    );
    expect(report.matches).toBe(2);
    expect(report.deaths).toBe(2);
    expect(report.zones[0]).toMatchObject({ map: 'Testland', zone: 'A Main', deaths: 2 });
    expect(report.weapons[0]).toMatchObject({ weapon: 'Vandal', deaths: 2 });
    expect(report.killers[0]).toMatchObject({ killer: 'Rival', agent: 'Reyna', weapon: 'Vandal', times: 2 });
    expect(report.maps[0]).toMatchObject({ map: 'Testland', rounds: 2, deaths: 2 });
    expect(report.signals.find((s) => s.tag === 'apertura')).toMatchObject({ count: 2, pct: 100 });
  });

  it('calcula el baseline de «solo» con los instantes en los que seguía vivo', async () => {
    // Kill 1: sigo vivo y pegado a mi compañero. Kill 2: muero sin nadie cerca.
    // Sin baseline, «100% de muertes en solitario» no diría nada.
    const report = await buildDeathReport(
      [
        {
          puuid: 'me',
          matches: [
            {
              matchId: 'm1',
              startedAt: 0,
              match: match({
                kills: [
                  {
                    round: 0,
                    time_in_round_in_ms: 10_000,
                    killer: { puuid: 'mate', name: 'Mate', team: 'Blue' },
                    victim: { puuid: 'rival', name: 'Rival', team: 'Red' },
                    weapon: { name: 'Vandal', type: 'Weapon' },
                    player_locations: [
                      loc(1100, 50, 'me', 'Blue', 0),
                      loc(1200, 50, 'mate', 'Blue', 0),
                      loc(-4000, 0, 'rival2', 'Red', 0),
                    ],
                  },
                  {
                    round: 0,
                    time_in_round_in_ms: 20_000,
                    killer: { puuid: 'rival', name: 'Rival', team: 'Red' },
                    victim: { puuid: 'me', name: 'Yo', team: 'Blue' },
                    weapon: { name: 'Vandal', type: 'Weapon' },
                    location: { x: 1100, y: 50 },
                    player_locations: [loc(1400, 50, 'rival', 'Red', Math.PI)],
                  },
                ],
              }),
            },
          ],
        },
      ],
      'alex',
      { from: '2026-10-14', to: '2026-10-14' },
    );

    expect(report.baseline.aliveSamples).toBe(1);
    expect(report.baseline.aloneAlivePct).toBe(0);
    expect(report.baseline.aloneDeathPct).toBe(100);
  });

  it('una cuenta sin partidas en la ventana no inventa un informe', async () => {
    const report = await buildDeathReport([], 'alex', { from: '2026-10-14', to: '2026-10-14' });
    expect(report).toMatchObject({ matches: 0, rounds: 0, deaths: 0 });
    expect(report.spots).toEqual([]);
    expect(report.zones).toEqual([]);
  });
});
