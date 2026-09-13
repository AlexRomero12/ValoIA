import { describe, expect, it } from 'vitest';
import { deltaOf, formOf, resultOf, type FormMatch } from './form';

function m(won: boolean, roundsWon = 13, roundsLost = 10): FormMatch {
  return { won, roundsWon, roundsLost };
}

describe('resultOf', () => {
  it('distingue victoria, derrota y empate', () => {
    expect(resultOf(m(true))).toBe('V');
    expect(resultOf(m(false))).toBe('D');
    expect(resultOf(m(false, 13, 13))).toBe('E');
  });
});

describe('formOf', () => {
  it('devuelve las últimas 5 con la más reciente primero', () => {
    const form = formOf([m(true), m(false), m(true, 13, 13), m(true), m(false), m(false)]);
    expect(form.last).toEqual(['V', 'D', 'E', 'V', 'D']);
  });

  it('calcula la racha actual y la corta con un empate', () => {
    expect(formOf([m(true), m(true), m(true), m(false)]).streak).toEqual({ type: 'win', count: 3 });
    expect(formOf([m(false), m(false), m(true)]).streak).toEqual({ type: 'loss', count: 2 });
    expect(formOf([m(true, 13, 13), m(true)]).streak).toBeNull();
  });

  it('sin partidas devuelve forma vacía', () => {
    expect(formOf([])).toEqual({ last: [], streak: null });
  });
});

describe('deltaOf', () => {
  it('resta la ventana anterior', () => {
    expect(deltaOf(220.4, 200)).toBeCloseTo(20.4, 6);
    expect(deltaOf(1.05, 1.2)).toBeCloseTo(-0.15, 6);
  });

  it('sin datos de cualquiera de las ventanas devuelve null', () => {
    expect(deltaOf(undefined, 200)).toBeNull();
    expect(deltaOf(220, null)).toBeNull();
    expect(deltaOf(null, undefined)).toBeNull();
  });
});
