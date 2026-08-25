import catalogJson from './catalog/valorant_s1.json';

interface TierDef {
  tier_id: number;
  thresholds: number[];
}

interface ScenarioRecord {
  id: number;
  name: string;
  task_id: string;
  task_mode: number;
  weapon_id: string;
  category_id: number;
  subcategory_id: number;
  workshop_id: string;
  tiers: TierDef[];
}

interface RankDef {
  name: string;
  color: string;
  tier_id: number;
  energy_threshold: number;
}

interface SubcategoryDef {
  id: number;
  name: string;
  color: string;
}

interface CategoryDef {
  id: number;
  name: string;
  color: string;
  subcategories: SubcategoryDef[];
}

interface TierGroup {
  playlist_workshop_id: string;
  id: number;
  name: string;
  color: string;
}

interface Catalog {
  scenarios: ScenarioRecord[];
  ranks: RankDef[];
  categories: CategoryDef[];
  tiers: TierGroup[];
}

const catalog = catalogJson as unknown as Catalog;

export type { ScenarioRecord };

export const SCENARIOS: ScenarioRecord[] = catalog.scenarios;
export const RANKS: RankDef[] = catalog.ranks;
export const CATEGORIES: CategoryDef[] = catalog.categories;
export const TIERS: TierGroup[] = catalog.tiers;

export const RANK_ORDER = [
  'iron',
  'bronze',
  'silver',
  'gold',
  'platinum',
  'diamond',
  'ascendant',
  'immortal',
  'radiant',
  'elysian',
  'aurora',
  'angelic',
];

const TIER_RANKS: Record<number, string[]> = {
  2: ['iron', 'bronze', 'silver', 'gold'],
  3: ['platinum', 'diamond', 'ascendant', 'immortal'],
  4: ['radiant', 'elysian', 'aurora', 'angelic'],
};

const scenarioByTask = new Map<string, ScenarioRecord>();
for (const s of SCENARIOS) {
  if (!scenarioByTask.has(s.task_id)) scenarioByTask.set(s.task_id, s);
}

export function findScenario(taskId: string): ScenarioRecord | undefined {
  return scenarioByTask.get(taskId);
}

export function categoryName(id: number): string {
  return CATEGORIES.find((c) => c.id === id)?.name ?? 'unknown';
}

export function subcategoryName(catId: number, subId: number): string {
  const cat = CATEGORIES.find((c) => c.id === catId);
  return cat?.subcategories.find((s) => s.id === subId)?.name ?? 'unknown';
}

export function subcategoryColor(catId: number, subId: number): string {
  const cat = CATEGORIES.find((c) => c.id === catId);
  return cat?.subcategories.find((s) => s.id === subId)?.color ?? '#888';
}

export function rankColor(name: string | null): string {
  return RANKS.find((r) => r.name === name)?.color ?? '#888';
}

export interface RankResult {
  rank: string | null;
  nextRank: string | null;
  progress: number | null;
  thresholds: number[];
  tierName: string;
}

export function rankForScenario(scenario: ScenarioRecord, score: number | null): RankResult | null {
  const tier = scenario.tiers[0];
  const tierName = TIERS.find((t) => t.id === tier?.tier_id)?.name ?? '?';
  if (!tier || score == null) {
    return { rank: null, nextRank: null, progress: null, thresholds: tier?.thresholds ?? [], tierName };
  }
  const ranks = TIER_RANKS[tier.tier_id] ?? [];
  const thr = tier.thresholds;
  let idx = -1;
  for (let i = 0; i < thr.length; i++) if (score >= thr[i]) idx = i;
  if (idx < 0) {
    return {
      rank: null,
      nextRank: ranks[0] ?? null,
      progress: thr[0] > 0 ? score / thr[0] : null,
      thresholds: thr,
      tierName,
    };
  }
  if (idx >= ranks.length - 1) {
    return { rank: ranks[ranks.length - 1] ?? null, nextRank: null, progress: 1, thresholds: thr, tierName };
  }
  return {
    rank: ranks[idx],
    nextRank: ranks[idx + 1],
    progress: (score - thr[idx]) / (thr[idx + 1] - thr[idx]),
    thresholds: thr,
    tierName,
  };
}