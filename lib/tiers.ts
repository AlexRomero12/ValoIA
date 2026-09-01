import { cached } from './cache';

/**
 * Iconos de rangos competitivos (valorant-api.com/v1/competitivetiers).
 * Solo cambia por episodio: se cachea 7 días. Clave = número de tier (3..27).
 */
export type TierIconMap = Record<string, string>;

const TIERS_KEY = 'valo:tier-icons';
const TIERS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function getTierIcons(): Promise<TierIconMap> {
  return cached(
    TIERS_KEY,
    TIERS_TTL_MS,
    async () => {
      const res = await fetch('https://valorant-api.com/v1/competitivetiers', {
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`competitivetiers HTTP ${res.status}`);
      const json = (await res.json()) as {
        data?: Array<{ tiers?: Array<{ tier?: number; largeIcon?: string | null; smallIcon?: string | null; icon?: string | null }> }>;
      };
      const episodes = json.data ?? [];
      const latest = episodes[episodes.length - 1];
      if (!latest?.tiers?.length) throw new Error('competitivetiers vacío');
      const map: TierIconMap = {};
      for (const t of latest.tiers) {
        const icon = t.largeIcon || t.smallIcon || t.icon;
        if (typeof t.tier === 'number' && icon) map[String(t.tier)] = icon;
      }
      return map;
    },
    (v) => {
      const m = v as TierIconMap;
      return !!m && Object.keys(m).length >= 20;
    },
  );
}