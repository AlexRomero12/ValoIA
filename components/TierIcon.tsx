'use client';

import { tierName } from '@/lib/ranks';
import { useTierIcons } from '@/lib/hooks';

/**
 * Icono del rango competitivo (valorant-api) con el nombre como tooltip.
 * Sin dato (`null`) cae al texto; el tier 0 (Unrated) usa su emblema de
 * "sin rango" y los tiers sin icono (1-2, reservados) al texto.
 */
export function TierIcon({ tier, size = 18 }: { tier: number | null | undefined; size?: number }) {
  const iconsQ = useTierIcons();
  const icons = iconsQ.data ?? {};
  const icon = tier == null ? undefined : icons[String(tier)];
  const name = tierName(tier);
  if (!icon) return <span className="tier-txt" title={name}>{name}</span>;
  return (
    <img
      className="tier-icon"
      src={icon}
      alt={name}
      title={name}
      width={size}
      height={size}
      loading="lazy"
    />
  );
}