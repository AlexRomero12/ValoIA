import { describe, expect, it } from 'vitest';
import { hasRrDetail, movementOf, rrChangeDetail, rrChips, rrTransitionText } from './rrDetail';

/** Entrada tal como la devuelve el mmr-history v2 desde v4.10. */
const CON_DETALLE = {
  match_id: 'm1',
  tier: { id: 19, name: 'Diamond 2' },
  rr: 90,
  last_change: 17,
  elo: 1690,
  rr_before_update: 73,
  rr_performance_bonus: 0,
  rr_penalty: 0,
  afk_penalty: 0,
  refunded_rr: 0,
  new_map_incentive_rr_forgiven: 0,
  is_placement_match: false,
  was_derank_protected: false,
  was_derank_protection_replenished: false,
  competitive_movement: 'MOVEMENT_UP',
  queue_id: 'competitive',
  tier_before_update: { id: 19, name: 'Diamond 2' },
  date: '2026-10-06T18:30:38Z',
};

/** Entrada anterior a v4.10: sin detalle. */
const SIN_DETALLE = { match_id: 'm0', rr: 50, last_change: 10, date: '2026-09-01T10:00:00Z' };

describe('movementOf', () => {
  it('traduce los movimientos de Riot', () => {
    expect(movementOf('MOVEMENT_UP')).toBe('up');
    expect(movementOf('MOVEMENT_DOWN')).toBe('down');
    expect(movementOf('MOVEMENT_NONE')).toBe('none');
  });

  it('deja desconocido como null (no inventa dirección)', () => {
    expect(movementOf('MOVEMENT_UNKNOWN')).toBeNull();
    expect(movementOf(null)).toBeNull();
  });
});

describe('rrChangeDetail', () => {
  it('marca el detalle nuevo como disponible', () => {
    const d = rrChangeDetail(CON_DETALLE);
    expect(d?.detailed).toBe(true);
    expect(hasRrDetail(CON_DETALLE)).toBe(true);
  });

  it('calcula el delta y el RR previo', () => {
    const d = rrChangeDetail(CON_DETALLE);
    expect(d?.rrBefore).toBe(73);
    expect(d?.rrAfter).toBe(90);
    expect(d?.delta).toBe(17);
    expect(rrTransitionText(d)).toBe('73 → 90 (+17)');
  });

  it('no marca detalle en registros antiguos ni inventa transición', () => {
    const d = rrChangeDetail(SIN_DETALLE);
    expect(d?.detailed).toBe(false);
    expect(d?.rrBefore).toBeNull();
    expect(rrTransitionText(d)).toBeNull();
    expect(rrChips(d)).toEqual([]);
  });

  it('deduce el delta desde el RR previo si falta last_change', () => {
    const d = rrChangeDetail({ ...CON_DETALLE, last_change: undefined });
    expect(d?.delta).toBe(17);
  });

  it('devuelve null sin entrada', () => {
    expect(rrChangeDetail(null)).toBeNull();
    expect(rrChangeDetail(undefined)).toBeNull();
  });
});

describe('rrChips', () => {
  it('solo pinta lo que aporta información', () => {
    expect(rrChips(rrChangeDetail(CON_DETALLE)).map((c) => c.key)).toEqual(['up', 'tierbefore']);
  });

  it('suma bono, devolución, perdón y penalizaciones', () => {
    const d = rrChangeDetail({
      ...CON_DETALLE,
      rr_performance_bonus: 5,
      refunded_rr: 12,
      new_map_incentive_rr_forgiven: 3,
      rr_penalty: 6,
      afk_penalty: 2,
      is_placement_match: true,
      was_derank_protected: true,
      was_derank_protection_replenished: true,
    });
    const keys = rrChips(d).map((c) => c.key);
    expect(keys).toContain('bonus');
    expect(keys).toContain('refunded');
    expect(keys).toContain('forgiven');
    expect(keys).toContain('penalty');
    expect(keys).toContain('afk');
    expect(keys).toContain('shield');
    expect(keys).toContain('shieldup');
    expect(keys).toContain('placement');
  });

  it('marca la cola cuando no es competitiva', () => {
    const d = rrChangeDetail({ ...CON_DETALLE, queue_id: 'unrated' });
    expect(rrChips(d).map((c) => c.key)).toContain('queue');
  });
});
