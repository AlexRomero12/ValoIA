import { describe, expect, it } from 'vitest';
import { buildRegistry, knownMatesOf, stackAnalysis } from './stacks';
import type { MatchRow } from './types';
import type { Profile } from './profileTypes';

function match(over: Partial<MatchRow>): MatchRow {
  return {
    matchId: 'x',
    date: '',
    timestamp: 0,
    map: 'Ascent',
    agent: 'Jett',
    won: true,
    rounds: 20,
    roundsWon: 13,
    roundsLost: 7,
    kills: 0,
    deaths: 0,
    assists: 0,
    acs: 0,
    adr: 0,
    hsPct: 0,
    tier: 18,
    tierChange: 0,
    durationMin: 30,
    ...over,
  };
}

const profiles: Profile[] = [
  { id: 'alex', label: 'Alex', name: 'AlexRomero12', tag: 'LAN', visible: true, color: '#ff4655' },
  { id: 'juan', label: 'Juan', name: 'ツJuanツ', tag: 'lol', visible: true, color: '#2fd08a', accounts: [{ name: 'Patricklol444', tag: 'NA1' }] },
];

describe('buildRegistry / knownMatesOf', () => {
  const reg = buildRegistry(profiles);

  it('resuelve cuenta principal y alternativas, sin duplicar', () => {
    const m = match({ mates: ['alexromero12#lan', 'ツjuanツ#lol', 'patricklol444#na1', 'random#0000'] });
    const known = knownMatesOf(m, reg);
    expect(known.map((k) => k.id).sort()).toEqual(['alex', 'juan']);
  });
});

describe('stackAnalysis', () => {
  const reg = buildRegistry(profiles);

  it('agrupa por tamaño de stack y por compañero conocido', () => {
    const ms = [
      match({ mates: ['random#1', 'random#2', 'random#3', 'random#4'] }), // solo
      match({ mates: ['alexromero12#lan', 'r#1', 'r#2', 'r#3'] }), // dúo con Alex
      match({ mates: ['ツjuanツ#lol', 'alexromero12#lan', 'r#1', 'r#2'] }), // trío
    ];
    const a = stackAnalysis(ms, reg);
    const solo = a.bySize.find((g) => g.key === 'size-1');
    const duo = a.bySize.find((g) => g.key === 'size-2');
    const trio = a.bySize.find((g) => g.key === 'size-3');
    expect(solo?.stats.games).toBe(1);
    expect(duo?.stats.games).toBe(1);
    expect(trio?.stats.games).toBe(1);
    const alex = a.byMate.find((g) => g.key === 'alex');
    const juan = a.byMate.find((g) => g.key === 'juan');
    expect(alex?.stats.games).toBe(2);
    expect(juan?.stats.games).toBe(1);
  });

  it('ignora partidas sin lista de compañeros', () => {
    const a = stackAnalysis([match({})], reg);
    expect(a.bySize).toHaveLength(0);
    expect(a.byMate).toHaveLength(0);
  });
});
