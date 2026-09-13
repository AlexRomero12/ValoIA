import { describe, expect, it } from 'vitest';
import { tierName, tierShort } from './ranks';

describe('tierName', () => {
  it('devuelve el nombre completo de tiers conocidos', () => {
    expect(tierName(0)).toBe('Unrated');
    expect(tierName(3)).toBe('Iron 1');
    expect(tierName(17)).toBe('Platinum 3');
    expect(tierName(27)).toBe('Radiant');
  });

  it('maneja tiers fuera de tabla y nulos', () => {
    expect(tierName(28)).toBe('Immortal 5');
    expect(tierName(-1)).toBe('Tier -1');
    expect(tierName(null)).toBe('—');
    expect(tierName(undefined)).toBe('—');
  });
});

describe('tierShort', () => {
  it('abrevia tiers conocidos', () => {
    expect(tierShort(3)).toBe('I1');
    expect(tierShort(17)).toBe('P3');
    expect(tierShort(26)).toBe('IM3');
  });

  it('Radiant y superiores', () => {
    expect(tierShort(27)).toBe('RAD');
    expect(tierShort(30)).toBe('RAD');
  });

  it('tiers sin tabla usan T<n>', () => {
    expect(tierShort(2)).toBe('T2');
  });
});
