import { describe, expect, it } from 'vitest';
import { conferenceLabel, premierFrom, premierRoleLabel, premierSeasonPlayed } from './premier';
import type { HenrikPremierTeam } from './henrik';

/** Respuesta real de /valorant/v2/premier/players (equipo Toxicos#TX) recortada. */
const TEAM: HenrikPremierTeam = {
  id: 'team-id',
  name: 'Toxicos',
  tag: 'TX',
  created_at: '2023-08-10T15:30:10Z',
  customization: { icon: 'icon-id', image: 'https://cdn/x.png', primary: '113c63', secondary: '759d41', tertiary: '3f3e40' },
  member: [
    { puuid: 'a', role: { id: 2, name: 'OWNER' }, joined_at: '2023-08-10T15:30:10Z' },
    { puuid: 'b', role: { id: 1, name: 'MEMBER' }, joined_at: '2026-07-30T01:53:39Z' },
  ],
  current_season: {
    id: 's1',
    name: null,
    enrolled: false,
    crest: 'NONE',
    stats: { wins: 0, losses: 0, matches: 0, rounds: { won: 0, lost: 0 } },
    placement: { points: 0, conference: 'LATAM_SOUTH', division: 17, is_provisional: true },
    promotion_applied: false,
    has_earned_promotion_for_next_season: false,
    has_earned_prestige: false,
  },
  seasons: [
    {
      id: 's1',
      enrolled: false,
      stats: { wins: 0, losses: 0, matches: 0, rounds: { won: 0, lost: 0 } },
      placement: { points: 0, conference: 'LATAM_SOUTH', division: 17, is_provisional: true },
    },
    {
      id: 's0',
      enrolled: true,
      crest: 'GOLD',
      stats: { wins: 7, losses: 3, matches: 10, rounds: { won: 120, lost: 90 } },
      placement: { points: 350, conference: 'LATAM_SOUTH', division: 12, is_provisional: false },
      has_earned_promotion_for_next_season: true,
    },
  ],
};

describe('etiquetas', () => {
  it('traduce conferencias y roles', () => {
    expect(conferenceLabel('LATAM_SOUTH')).toBe('LATAM Sur');
    expect(conferenceLabel('NA')).toBe('Norteamérica');
    expect(conferenceLabel(null)).toBeNull();
    expect(premierRoleLabel('OWNER')).toBe('Capitán');
    expect(premierRoleLabel('MEMBER')).toBe('Miembro');
    expect(premierRoleLabel(null)).toBe('Miembro');
  });
});

describe('premierFrom', () => {
  it('resuelve los nombres de los miembros y marca los conocidos', () => {
    const p = premierFrom(TEAM, { a: { name: 'AlexRomero12', tag: 'LAN' } }, ['a']);
    expect(p?.members[0]).toMatchObject({ name: 'AlexRomero12', tag: 'LAN', role: 'OWNER', known: true });
    expect(p?.members[1]).toMatchObject({ name: null, role: 'MEMBER', known: false });
  });

  it('conserva la temporada en curso aunque esté sin inscribir', () => {
    const p = premierFrom(TEAM);
    expect(p?.current?.enrolled).toBe(false);
    expect(p?.current?.division).toBe(17);
    expect(premierSeasonPlayed(p?.current)).toBe(false);
  });

  it('descarta las temporadas vacías del historial', () => {
    const p = premierFrom(TEAM);
    expect(p?.seasons.map((s) => s.id)).toEqual(['s0']);
  });

  it('calcula el win rate de una temporada jugada', () => {
    const p = premierFrom(TEAM);
    expect(p?.seasons[0]).toMatchObject({ wins: 7, losses: 3, matches: 10, winRate: 0.7, points: 350, earnedPromotion: true });
    expect(premierSeasonPlayed(p?.seasons[0])).toBe(true);
  });

  it('sin equipo devuelve null', () => {
    expect(premierFrom(null)).toBeNull();
    expect(premierFrom({})).toBeNull();
  });
});
