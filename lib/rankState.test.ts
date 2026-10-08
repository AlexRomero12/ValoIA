import { describe, expect, it } from 'vitest';
import { hasRankExtras, protectionLabel, rankStateFrom } from './rankState';
import type { HenrikMmrV3 } from './henrik';

/** Respuesta real de /valorant/v3/mmr recortada. */
const MMR: HenrikMmrV3 = {
  account: { name: 'AlexRomero12', tag: 'LAN', puuid: 'p' },
  current: {
    tier: { id: 19, name: 'Diamond 2' },
    rr: 90,
    last_change: 17,
    elo: 1690,
    games_needed_for_rating: 0,
    rank_protection_shields: 0,
    is_at_rank_protected_tier: false,
    rank_protection_status: 'Empty',
    games_needed_for_leaderboard: 0,
    leaderboard_placement: null,
  },
  peak: {
    season: { id: '4539cac3', short: 'e8a3' },
    ranking_schema: 'ascendant',
    tier: { id: 20, name: 'Diamond 3' },
    rr: 0,
  },
  lifetime_prestige: { PLATINUM: { count: 1 }, GOLD: { count: 5 }, DIAMOND: { count: 5 }, IRON: { count: 0 } },
  ranked_state: { is_act_rank_badge_hidden: false, is_leaderboard_anonymized: false },
  seasonal: [],
};

describe('protectionLabel', () => {
  it('traduce los estados de Riot', () => {
    expect(protectionLabel('Empty')).toBe('Sin escudos');
    expect(protectionLabel('Available')).toBe('Escudo disponible');
  });

  it('un estado desconocido se muestra tal cual', () => {
    expect(protectionLabel('Weird')).toBe('Weird');
    expect(protectionLabel(null)).toBeNull();
  });
});

describe('rankStateFrom', () => {
  it('extrae tier, RR, pico y escudos', () => {
    const r = rankStateFrom(MMR);
    expect(r?.tier).toEqual({ id: 19, name: 'Diamond 2' });
    expect(r?.rr).toBe(90);
    expect(r?.peak).toEqual({ tier: 'Diamond 3', rr: 0, season: 'e8a3' });
    expect(r?.protection).toEqual({ shields: 0, status: 'Empty', atProtectedTier: false });
  });

  it('ordena el prestigio y descarta los tiers a cero', () => {
    const r = rankStateFrom(MMR);
    expect(r?.prestige.map((p) => p.tier)).toEqual(['DIAMOND', 'GOLD', 'PLATINUM']);
  });

  it('sin datos de rango devuelve null', () => {
    expect(rankStateFrom(null)).toBeNull();
    expect(rankStateFrom({})).toBeNull();
  });

  it('soporta respuestas parciales sin romper', () => {
    const r = rankStateFrom({ current: { tier: { id: 5, name: 'Silver 1' } } });
    expect(r?.tier?.name).toBe('Silver 1');
    expect(r?.rr).toBeNull();
    expect(r?.prestige).toEqual([]);
    expect(r?.protection.shields).toBe(0);
  });
});

describe('hasRankExtras', () => {
  it('detecta cuándo hay algo más que el tier/RR de siempre', () => {
    expect(hasRankExtras(rankStateFrom(MMR))).toBe(true);
    expect(hasRankExtras(rankStateFrom({ current: { tier: { id: 5, name: 'Silver 1' }, rr: 20 } }))).toBe(false);
    expect(hasRankExtras(null)).toBe(false);
  });
});
