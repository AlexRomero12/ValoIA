import { describe, expect, it } from 'vitest';
import { sameRulesDay, type StoredRulesDay } from './rulesHistory';

function day(over: Partial<StoredRulesDay>): StoredRulesDay {
  return {
    key: 'perfil:2026-09-01',
    profileId: 'perfil',
    rulesVersion: 1,
    label: 'lun 1 sep',
    dayStart: 0,
    matches: 3,
    realRR: 10,
    planRR: 10,
    planPoolRR: 10,
    rrCoverage: true,
    rrMissing: 0,
    violationCount: 0,
    bannedCount: 0,
    violationCost: null,
    violationLoss: null,
    violationGain: null,
    cutAt: null,
    cutIgnored: false,
    sessions: 1,
    savedAt: 0,
    ...over,
  };
}

describe('sameRulesDay', () => {
  it('considera iguales dos snapshots idénticos', () => {
    expect(sameRulesDay(day({}), day({}))).toBe(true);
  });

  it('detecta el cambio de rulesVersion aunque la evaluación no cambie', () => {
    expect(sameRulesDay(day({}), day({ rulesVersion: 2 }))).toBe(false);
  });

  it('detecta cambios de bannedCount o de evaluación', () => {
    expect(sameRulesDay(day({}), day({ bannedCount: 2 }))).toBe(false);
    expect(sameRulesDay(day({}), day({ violationCount: 1 }))).toBe(false);
  });
});
