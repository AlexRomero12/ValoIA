import { describe, expect, it } from 'vitest';
import { MAXED_LEVEL, masteryByAgent, masteryFrom, topMastery } from './mastery';
import type { HenrikAgentMastery } from './henrik';

/** Respuesta real de /valorant/v1/agent-mastery recortada. */
const MASTERY: HenrikAgentMastery = {
  account: { name: 'AlexRomero12', tag: 'LAN', puuid: 'p' },
  agents: [
    {
      agent: { id: 'chamber-id', name: 'Chamber' },
      flourish: { short_level: 1, long_level: 1 },
      tracks: [{ id: 't', name: null, level: 4 }],
      modules: null,
    },
    { agent: { id: 'sage-id', name: 'Sage' }, flourish: { short_level: 0, long_level: 0 }, tracks: [{ id: 't', level: 2 }] },
    { agent: { id: 'waylay-id', name: 'Waylay' }, tracks: [{ id: 't', level: 1 }], modules: null },
    { agent: { id: 'jett-id', name: 'Jett' }, tracks: [{ id: 't', level: 5 }] },
    { agent: { id: 'iso-id', name: 'Iso' }, tracks: [{ id: 't', level: null }] },
  ],
};

describe('masteryFrom', () => {
  it('ordena por nivel y suma el total', () => {
    const m = masteryFrom(MASTERY);
    expect(m?.agents.map((a) => a.agent)).toEqual(['Jett', 'Chamber', 'Sage', 'Waylay', 'Iso']);
    expect(m?.totalLevel).toBe(12);
  });

  it('cuenta los agentes trabajados', () => {
    expect(masteryFrom(MASTERY)?.maxed).toBe(1);
    expect(MAXED_LEVEL).toBe(5);
  });

  it('un agente sin nivel no aporta al total', () => {
    const m = masteryFrom(MASTERY);
    expect(m?.agents.find((a) => a.agent === 'Iso')?.level).toBe(0);
  });

  it('recoge los módulos de stats cuando Riot los manda', () => {
    const m = masteryFrom({
      agents: [
        {
          agent: { id: 'a', name: 'Jett' },
          tracks: [{ id: 't', level: 3 }],
          modules: [{ id: 'm1', stat: { id: 's1', name: 'Kills' }, value: 4200 }],
        },
      ],
    });
    expect(m?.agents[0].modules).toEqual([{ label: 'Kills', value: 4200 }]);
  });

  it('sin agentes devuelve null', () => {
    expect(masteryFrom(null)).toBeNull();
    expect(masteryFrom({})).toBeNull();
    expect(masteryFrom({ agents: [] })).toBeNull();
  });
});

describe('helpers de cruce', () => {
  it('indexa por nombre en minúsculas', () => {
    const m = masteryFrom(MASTERY);
    const byName = masteryByAgent(m);
    expect(byName.get('chamber')?.level).toBe(4);
  });

  it('topMastery devuelve los N primeros', () => {
    expect(topMastery(masteryFrom(MASTERY), 2).map((a) => a.agent)).toEqual(['Jett', 'Chamber']);
  });
});
