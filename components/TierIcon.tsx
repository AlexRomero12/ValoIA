'use client';

import { tierName } from '@/lib/metas';
import { useTierIcons } from '@/lib/hooks';

/**
 * Icono del rango competitivo (valorant-api) con el nombre como tooltip.
 * Si no hay icono para ese tier, cae al texto (tierName).
 */
export function TierIcon({ tier, size = 18 }: { tier: number | null | undefined; size?: number }) {
  const iconsQ = useTierIcons();
  const icons = iconsQ.data ?? {};
  const t = tier ?? 0;
  const icon = t > 0 ? icons[String(t)] : undefined;
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