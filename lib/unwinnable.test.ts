import { describe, expect, it } from 'vitest';
import { UNWINNABLE_LIMITS, lossTag, lossTagTitle, type LossFields } from './unwinnable';

/** Derrota base donde el jugador cargó al equipo (2 compañeros muy malos). */
function loss(over: Partial<LossFields> = {}): LossFields {
  return {
    won: false,
    roundsWon: 8,
    roundsLost: 13,
    acs: 220,
    kills: 17,
    deaths: 14,
    mateAcs: 150,
    mateBadCount: 2,
    ...over,
  };
}

describe('lossTag', () => {
  it('marca injugable una derrota con 2+ compañeros muy malos y jugador por encima', () => {
    expect(lossTag(loss())).toBe('unwinnable');
  });

  it('marca injugable con 3 compañeros muy malos', () => {
    expect(lossTag(loss({ mateBadCount: 3 }))).toBe('unwinnable');
  });

  it('no marca con un solo compañero muy malo', () => {
    expect(lossTag(loss({ mateBadCount: UNWINNABLE_LIMITS.badMates - 1 }))).toBe(null);
  });

  it('no marca en victorias aunque haya 2 compañeros malos', () => {
    expect(lossTag(loss({ won: true }))).toBe(null);
  });

  it('no marca empates (marcador igualado)', () => {
    expect(lossTag(loss({ roundsWon: 13, roundsLost: 13 }))).toBe(null);
  });

  it('no marca sin detalle de compañeros', () => {
    expect(lossTag(loss({ mateAcs: null, mateBadCount: null }))).toBe(null);
  });

  it('marca "mi culpa" si el jugador quedó bajo la media con K/D negativo', () => {
    expect(lossTag(loss({ acs: 120, mateAcs: 190, kills: 8, deaths: 16 }))).toBe('mine');
  });

  it('no marca "mi culpa" si el K/D se salva aunque el ACS quede bajo', () => {
    expect(lossTag(loss({ acs: 120, mateAcs: 190, kills: 16, deaths: 16 }))).toBe(null);
  });

  it('no marca "mi culpa" si el ACS no está bajo la media del equipo', () => {
    expect(lossTag(loss({ acs: 195, mateAcs: 190, kills: 8, deaths: 16, mateBadCount: 0 }))).toBe(null);
  });

  it('mi culpa y injugable son mutuamente excluyentes', () => {
    expect(lossTag(loss({ acs: 120, mateAcs: 190, kills: 8, deaths: 16, mateBadCount: 4 }))).toBe('mine');
  });
});

describe('lossTagTitle', () => {
  it('el tooltip de injugable incluye los números', () => {
    const title = lossTagTitle(loss({ mateAcs: 148.6, acs: 231, mateBadCount: 2 }), 'unwinnable');
    expect(title).toContain('2 compañeros');
    expect(title).toContain('149 ACS');
    expect(title).toContain('231 ACS');
  });

  it('el tooltip de mi culpa incluye ACS y K/D del jugador', () => {
    const title = lossTagTitle(loss({ acs: 118, mateAcs: 190, kills: 8, deaths: 16 }), 'mine');
    expect(title).toContain('118 ACS');
    expect(title).toContain('0.50 K/D');
    expect(title).toContain('190 ACS');
  });
});
