import type { HenrikMmrV3 } from './henrik';
import type { RankProtection, ValRankState } from './types';

/**
 * Estado de rango enriquecido a partir del MMR v3 de Henrik: pico histórico,
 * escudos de protección, prestigio y partidas que faltan para el rating.
 *
 * Todo lo que no venga en la respuesta se deja en `null`/0 en vez de inventar
 * valores: el MMR v3 es opcional en el resumen (si falla, el dash sigue con el
 * mmr-history de siempre).
 *
 * Módulo puro: sin red ni disco.
 */

const PROTECTION_LABELS: Record<string, string> = {
  empty: 'Sin escudos',
  available: 'Escudo disponible',
  active: 'Escudo activo',
  used: 'Escudo usado',
  full: 'Escudo completo',
};

/** Etiqueta en español del `rank_protection_status` de Riot. */
export function protectionLabel(status: string | null | undefined): string | null {
  if (!status) return null;
  const key = status.trim().toLowerCase();
  return PROTECTION_LABELS[key] ?? status;
}

function tierName(t: { name?: string } | null | undefined): string | null {
  return t?.name ?? null;
}

export function rankStateFrom(mmr: HenrikMmrV3 | null | undefined): ValRankState | null {
  if (!mmr || typeof mmr !== 'object') return null;
  const cur = mmr.current;
  const peak = mmr.peak;
  if (!cur && !peak) return null;

  const protection: RankProtection = {
    shields: typeof cur?.rank_protection_shields === 'number' ? cur.rank_protection_shields : 0,
    status: cur?.rank_protection_status ?? null,
    atProtectedTier: cur?.is_at_rank_protected_tier === true,
  };

  const prestige = Object.entries(mmr.lifetime_prestige ?? {})
    .map(([tier, v]) => ({ tier, count: typeof v?.count === 'number' ? v.count : 0 }))
    .filter((p) => p.count > 0)
    .sort((a, b) => b.count - a.count || a.tier.localeCompare(b.tier));

  return {
    tier: cur?.tier?.id != null ? { id: cur.tier.id, name: tierName(cur.tier) ?? '?' } : null,
    rr: typeof cur?.rr === 'number' ? cur.rr : null,
    elo: typeof cur?.elo === 'number' ? cur.elo : null,
    peak: peak
      ? {
          tier: tierName(peak.tier),
          rr: typeof peak.rr === 'number' ? peak.rr : null,
          season: peak.season?.short ?? null,
        }
      : null,
    protection,
    gamesNeededForRating: typeof cur?.games_needed_for_rating === 'number' ? cur.games_needed_for_rating : null,
    gamesNeededForLeaderboard:
      typeof cur?.games_needed_for_leaderboard === 'number' ? cur.games_needed_for_leaderboard : null,
    leaderboardPlacement: typeof cur?.leaderboard_placement === 'number' ? cur.leaderboard_placement : null,
    prestige,
    rankedBadgeHidden: mmr.ranked_state?.is_act_rank_badge_hidden === true,
    leaderboardAnonymized: mmr.ranked_state?.is_leaderboard_anonymized === true,
  };
}

/** true si hay algo que merezca pintar más allá del tier/RR de siempre. */
export function hasRankExtras(r: ValRankState | null | undefined): boolean {
  if (!r) return false;
  return (
    r.peak?.tier != null ||
    r.protection.shields > 0 ||
    r.protection.atProtectedTier ||
    r.prestige.length > 0 ||
    (r.gamesNeededForRating ?? 0) > 0 ||
    (r.gamesNeededForLeaderboard ?? 0) > 0 ||
    r.leaderboardPlacement != null
  );
}
