import { describe, expect, it } from 'vitest';
import { clampPoolRule, clampRulesPools, emptySessionRules, sameRulesContent } from './profileTypes';

describe('clampPoolRule', () => {
  it('deja un solo principal', () => {
    expect(clampPoolRule({ main: ['Jett', 'Reyna'], backup: [] })).toEqual({ main: ['Jett'], backup: [] });
  });

  it('limita backups a dos y quita duplicados con el principal', () => {
    expect(clampPoolRule({ main: ['Jett'], backup: ['Jett', 'Reyna', 'Omen', 'Sage'] })).toEqual({
      main: ['Jett'],
      backup: ['Reyna', 'Omen'],
    });
  });

  it('sin regla devuelve vacío', () => {
    expect(clampPoolRule(undefined)).toEqual({ main: [], backup: [] });
  });
});

describe('clampRulesPools', () => {
  it('normaliza la default y todos los mapas', () => {
    const rules = emptySessionRules();
    rules.pool.default = { main: ['Jett', 'Reyna'], backup: ['Sage', 'Omen', 'Killjoy'] };
    rules.pool.byMap.Ascent = { main: ['Sova', 'Fade'], backup: ['Sova'] };
    const out = clampRulesPools(rules);
    expect(out.pool.default).toEqual({ main: ['Jett'], backup: ['Sage', 'Omen'] });
    expect(out.pool.byMap.Ascent).toEqual({ main: ['Sova'], backup: [] });
  });
});

describe('sameRulesContent', () => {
  it('ignora rulesVersion (mismo contenido, versión distinta)', () => {
    const a = emptySessionRules();
    const b = { ...emptySessionRules(), rulesVersion: 7 };
    expect(sameRulesContent(a, b)).toBe(true);
  });

  it('compara listas sin importar el orden', () => {
    const a = emptySessionRules();
    a.pool.byMap.Ascent = { main: ['Jett', 'Omen'], backup: ['Sage'] };
    const b = emptySessionRules();
    b.pool.byMap.Ascent = { main: ['Omen', 'Jett'], backup: ['Sage'] };
    expect(sameRulesContent(a, b)).toBe(true);
  });

  it('detecta cambios reales en pool, corte, pausa o metas', () => {
    const base = emptySessionRules();
    const stop = { ...emptySessionRules(), stop: { losses: 3, kdBelow: 0.9 } };
    const goals = { ...emptySessionRules(), goals: { wr: 60 } };
    expect(sameRulesContent(base, stop)).toBe(false);
    expect(sameRulesContent(base, goals)).toBe(false);
  });

  it('trata default vacío y default ausente como equivalentes', () => {
    const a = emptySessionRules();
    const b = { ...emptySessionRules(), pool: { byMap: {} } };
    expect(sameRulesContent(a, b)).toBe(true);
  });

  it('sin reglas en alguno de los lados devuelve false', () => {
    expect(sameRulesContent(undefined, emptySessionRules())).toBe(false);
    expect(sameRulesContent(emptySessionRules(), null)).toBe(false);
  });
});
