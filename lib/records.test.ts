import { describe, expect, it } from 'vitest';
import { formatRecordValue, improvedRecords, improvedRecordsText, recordsFrom } from './records';
import type { HenrikAccolades } from './henrik';

const ME = 'puuid-me';

/** Respuesta real de /valorant/v1/accolades recortada a lo esencial. */
const ACC: HenrikAccolades = {
  account: { name: 'AlexRomero12', tag: 'LAN', puuid: ME },
  summary: {
    all_time: [
      { id: 'a', type: 'clutches', count: 4, best_value: 1 },
      { id: 'b', type: 'kills', count: 2, best_value: 26 },
      { id: 'c', type: 'damage_per_round', count: 4, best_value: 192.66667 },
      { id: 'd', type: 'headshot_percentage', count: 3, best_value: 58.33333 },
      { id: 'e', type: 'mvp', count: 2, best_value: 354.01852 },
      { id: 'f', type: 'first_blood', count: 11, best_value: 5 },
    ],
    seasons: [
      {
        season: { id: 'e11a5', short: 'e11a5' },
        accolades: [{ id: 'b', type: 'kills', count: 1, best_value: 21 }],
      },
    ],
  },
  matches: [
    {
      match_id: 'm1',
      started_at: '2026-10-06T18:30:38Z',
      players: [
        {
          puuid: ME,
          accolades: [
            { id: 'b', type: 'kills', value: 22, is_act_record: false },
            { id: 'z', type: 'clutches', value: 2, is_act_record: true },
          ],
        },
        { puuid: 'otro', accolades: [{ id: 'b', type: 'kills', value: 40, is_act_record: true }] },
      ],
    },
  ],
};

describe('formatRecordValue', () => {
  it('formatea según el tipo de récord', () => {
    expect(formatRecordValue('kills', 26)).toBe('26 kills');
    expect(formatRecordValue('damage_per_round', 192.66667)).toBe('192.7 ADR');
    expect(formatRecordValue('headshot_percentage', 58.33333)).toBe('58.3 % HS');
    expect(formatRecordValue('mvp', 354.01852)).toBe('354 pts');
  });

  it('un tipo desconocido no rompe el formato', () => {
    expect(formatRecordValue('raro', 7)).toBe('7');
  });
});

describe('recordsFrom', () => {
  it('traduce y ordena los récords por el orden del método', () => {
    const r = recordsFrom(ACC);
    expect(r?.allTime.map((m) => m.kind)).toEqual([
      'kills',
      'first_blood',
      'damage_per_round',
      'clutches',
      'headshot_percentage',
      'mvp',
    ]);
    const kills = r?.allTime.find((m) => m.kind === 'kills');
    expect(kills?.label).toBe('Más kills en una partida');
    expect(kills?.count).toBe(2);
    expect(kills?.bestText).toBe('26 kills');
  });

  it('incluye la temporada en curso', () => {
    const r = recordsFrom(ACC);
    expect(r?.season?.season).toBe('e11a5');
    expect(r?.season?.metrics[0].bestText).toBe('21 kills');
  });

  it('solo coge los accolades del jugador de la cuenta', () => {
    const r = recordsFrom(ACC);
    expect(r?.recent).toHaveLength(1);
    expect(r?.recent[0].items.map((i) => i.valueText)).toEqual(['22 kills', '2 clutches']);
  });

  it('lista los récords del acto vigente', () => {
    const r = recordsFrom(ACC);
    expect(r?.actRecords).toEqual([
      { label: 'Más clutches 1vX en una partida', value: 2, valueText: '2 clutches', matchId: 'm1', date: '2026-10-06T18:30:38Z' },
    ]);
  });

  it('sin datos devuelve null (la vista muestra su estado vacío)', () => {
    expect(recordsFrom(null)).toBeNull();
    expect(recordsFrom({})).toBeNull();
    expect(recordsFrom({ account: { puuid: ME }, summary: { all_time: [] }, matches: [] })).toBeNull();
  });
});

describe('improvedRecords', () => {
  const prev: HenrikAccolades = {
    summary: { all_time: [{ type: 'kills', count: 1, best_value: 20 }, { type: 'aces', count: 1, best_value: 1 }] },
  };

  it('solo devuelve lo que sube', () => {
    const next: HenrikAccolades = {
      summary: {
        all_time: [
          { type: 'kills', count: 2, best_value: 26 },
          { type: 'aces', count: 1, best_value: 1 },
        ],
      },
    };
    const imp = improvedRecords(prev, next);
    expect(imp).toHaveLength(1);
    expect(imp[0]).toMatchObject({ kind: 'kills', from: 20, to: 26, toText: '26 kills' });
    expect(improvedRecordsText(imp)).toBe('26 kills');
  });

  it('un récord nuevo (sin captura previa) cuenta como mejora', () => {
    const next: HenrikAccolades = {
      summary: { all_time: [{ type: 'kills', count: 1, best_value: 26 }, { type: 'aces', count: 1, best_value: 2 }] },
    };
    const kinds = improvedRecords(prev, next).map((r) => r.kind);
    expect(kinds).toEqual(['kills', 'aces']);
  });

  it('sin captura previa avisa de todos los récords con valor', () => {
    const imp = improvedRecords(null, { summary: { all_time: [{ type: 'kills', best_value: 26 }] } });
    expect(imp).toHaveLength(1);
    expect(imp[0].from).toBe(0);
  });

  it('sin datos nuevos no avisa nada', () => {
    expect(improvedRecords(prev, null)).toEqual([]);
    expect(improvedRecords(prev, { summary: { all_time: [] } })).toEqual([]);
  });
});
