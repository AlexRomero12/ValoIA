/**
 * Nombres de rangos de VALORANT: única fuente (cliente y servidor).
 * Antes había tres tablas (lib/metas.ts, lib/valorant.ts y lib/compare.ts).
 * Los iconos viven aparte, en `lib/tiers.ts` (server-only, usa cache).
 */

export const TIER_NAMES: readonly string[] = [
  'Unrated', 'Unrated', 'Unrated',
  'Iron 1', 'Iron 2', 'Iron 3',
  'Bronze 1', 'Bronze 2', 'Bronze 3',
  'Silver 1', 'Silver 2', 'Silver 3',
  'Gold 1', 'Gold 2', 'Gold 3',
  'Platinum 1', 'Platinum 2', 'Platinum 3',
  'Diamond 1', 'Diamond 2', 'Diamond 3',
  'Ascendant 1', 'Ascendant 2', 'Ascendant 3',
  'Immortal 1', 'Immortal 2', 'Immortal 3',
  'Radiant',
];

/** Nombre completo de un tier (`17 → "Platinum 3"`). */
export function tierName(tier: number | null | undefined): string {
  if (tier == null) return '—';
  return TIER_NAMES[tier] ?? (tier > 27 ? `Immortal ${tier - 23}` : `Tier ${tier}`);
}

const TIER_SHORT: Record<number, string> = {
  0: 'UR', 3: 'I1', 4: 'I2', 5: 'I3',
  6: 'B1', 7: 'B2', 8: 'B3',
  9: 'S1', 10: 'S2', 11: 'S3',
  12: 'G1', 13: 'G2', 14: 'G3',
  15: 'P1', 16: 'P2', 17: 'P3',
  18: 'D1', 19: 'D2', 20: 'D3',
  21: 'A1', 22: 'A2', 23: 'A3',
  24: 'IM1', 25: 'IM2', 26: 'IM3',
  27: 'RAD',
};

/** Nombre corto de un tier (`17 → "P3"`, `27+ → "RAD"`). */
export function tierShort(tier: number): string {
  if (tier >= 27) return 'RAD';
  return TIER_SHORT[tier] ?? `T${tier}`;
}
