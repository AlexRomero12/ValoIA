import { describe, expect, it } from 'vitest';
import { buildRulesProposal, diffProposal, type RulesProposal } from './rulesProposal';
import { emptySessionRules, type SessionRules } from './profileTypes';
import type { MatchRow } from './types';

const PROPOSAL_GOALS = { wr: 55, kd: 1.05, acs: 220, hsPct: 25, adr: 150, fbPositive: true };

function proposal(): RulesProposal {
  return {
    matches: 20,
    rules: { ...emptySessionRules(), goals: { ...PROPOSAL_GOALS } },
    maps: [
      { map: 'Sunset', main: [{ name: 'Raze', wr: 75, games: 4 }], backup: [] },
      { map: 'Split', main: [{ name: 'Sage', wr: 75, games: 5 }], backup: [{ name: 'Raze', wr: 22.2, games: 9 }] },
    ],
    bannedAgents: [{ name: 'Iso', wr: 20, games: 4 }],
    bannedRoles: [{ name: 'Controller', wr: 40, games: 6 }],
  };
}

/** Reglas vigentes que ya aplicaron parte de la propuesta. */
function current(over: Partial<SessionRules> = {}): SessionRules {
  return { ...emptySessionRules(), goals: { ...PROPOSAL_GOALS }, ...over };
}

describe('buildRulesProposal', () => {
  function mk(map: string, agent: string, won: boolean): MatchRow {
    return {
      matchId: `${map}-${agent}-${Math.random()}`,
      date: '',
      timestamp: 0,
      map,
      agent,
      won,
      rounds: 23,
      roundsWon: won ? 13 : 10,
      roundsLost: won ? 10 : 13,
      kills: 10,
      deaths: 10,
      assists: 5,
      acs: 150,
      adr: 120,
      hsPct: 20,
      tier: 0,
      tierChange: 0,
      durationMin: 30,
    };
  }

  it('propone un solo principal y hasta dos backups por mapa', () => {
    const ms = [
      ...Array.from({ length: 3 }, () => mk('Ascent', 'Jett', true)),
      ...Array.from({ length: 3 }, () => mk('Ascent', 'Reyna', true)),
      ...Array.from({ length: 3 }, () => mk('Ascent', 'Omen', true)),
      mk('Ascent', 'Sage', true),
    ];
    const p = buildRulesProposal(ms);
    expect(p).not.toBeNull();
    const ascent = p!.maps.find((m) => m.map === 'Ascent')!;
    expect(ascent.main).toHaveLength(1);
    expect(ascent.backup.length).toBeLessThanOrEqual(2);
  });
});

describe('diffProposal', () => {
  it('sin reglas vigentes marca todo como pendiente', () => {
    const d = diffProposal(proposal(), undefined);
    expect(d.mapsApplied).toEqual([]);
    expect(d.mapsPending.map((m) => m.map)).toEqual(['Sunset', 'Split']);
    expect(d.bannedPending.map((b) => b.name)).toEqual(['Iso']);
    expect(d.rolesPending.map((r) => r.name)).toEqual(['Controller']);
    expect(d.goalsPending).toBe(true);
    expect(d.pendingTotal).toBe(5);
  });

  it('detecta los mapas ya aplicados sin importar el orden de los agentes', () => {
    const cur = current();
    cur.pool.byMap.Sunset = { main: ['Raze'], backup: [] };
    cur.pool.byMap.Split = { main: ['Sage'], backup: ['Raze'] };
    const d = diffProposal(proposal(), cur);
    expect(d.mapsApplied.sort()).toEqual(['Split', 'Sunset']);
    expect(d.mapsPending).toEqual([]);
  });

  it('acepta mains/backups extra como ya aplicado (ajustes propios)', () => {
    const cur = current({ bannedAgents: ['Iso'], bannedRoles: ['Controller'] });
    cur.pool.byMap.Sunset = { main: ['Raze'], backup: [] };
    // Split: Sage principal y Raze backup (lo propuesto) + Jett de backup extra.
    cur.pool.byMap.Split = { main: ['Sage'], backup: ['Raze', 'Jett'] };
    const d = diffProposal(proposal(), cur);
    expect(d.mapsApplied.sort()).toEqual(['Split', 'Sunset']);
    expect(d.pendingTotal).toBe(0);
  });

  it('si el agente propuesto cambió de rol, el mapa no está aplicado', () => {
    const cur = current();
    cur.pool.byMap.Sunset = { main: ['Raze'], backup: [] };
    // Sage está de backup y Raze de principal: lo propuesto no se cumplió.
    cur.pool.byMap.Split = { main: ['Raze'], backup: ['Sage'] };
    const d = diffProposal(proposal(), cur);
    expect(d.mapsApplied).toEqual(['Sunset']);
    expect(d.mapsPending.map((m) => m.map)).toEqual(['Split']);
  });

  it('un mapa cubierto por la regla default también cuenta como aplicado', () => {
    const cur = current();
    cur.pool.default = { main: ['Raze'], backup: [] };
    const d = diffProposal(proposal(), cur);
    expect(d.mapsApplied).toEqual(['Sunset']);
    expect(d.mapsPending.map((m) => m.map)).toEqual(['Split']);
  });

  it('cuenta prohibidos, roles y metas pendientes por separado', () => {
    const cur = current();
    cur.bannedAgents = ['Iso'];
    cur.goals = {};
    const d = diffProposal(proposal(), cur);
    expect(d.bannedApplied).toEqual(['Iso']);
    expect(d.bannedPending).toEqual([]);
    expect(d.rolesPending.map((r) => r.name)).toEqual(['Controller']);
    expect(d.goalsPending).toBe(true);
    expect(d.pendingTotal).toBe(4);
  });

  it('con todo aplicado el pendiente queda en cero', () => {
    const cur = current({
      bannedAgents: ['Iso'],
      bannedRoles: ['Controller'],
    });
    cur.pool.byMap.Sunset = { main: ['Raze'], backup: [] };
    cur.pool.byMap.Split = { main: ['Sage'], backup: ['Raze'] };
    const d = diffProposal(proposal(), cur);
    expect(d.pendingTotal).toBe(0);
  });
});
