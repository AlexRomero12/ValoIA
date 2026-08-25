import { CONFIG } from './config';
import { env } from './env';
import {
  getDayTasks,
  getProfile,
  type DayTaskRow,
  type Profile,
  type SkillScore,
} from './aimlab';
import {
  findScenario,
  categoryName,
  subcategoryName,
  subcategoryColor,
  rankForScenario,
  rankColor,
} from './catalog';

export interface TaskSummary extends DayTaskRow {
  category: string;
  subcategory: string;
  subcategoryColor: string;
  tierName: string;
  rank: string | null;
  rankColor: string;
  nextRank: string | null;
  progress: number | null;
  thresholds: number[];
}

export interface DayEntry {
  date: string;
  label: string;
  runs: number;
  scenariosPlayed: number;
  tasks: TaskSummary[];
  byTask: Record<string, TaskSummary>;
}

export interface PbEntry {
  taskId: string;
  taskName: string;
  category: string;
  subcategory: string;
  subcategoryColor: string;
  tierName: string;
  bestScore: number | null;
  bestAccuracy: number | null;
  runs: number;
  rank: string | null;
  rankColor: string;
  nextRank: string | null;
  progress: number | null;
  thresholds: number[];
}

export interface FocusResult {
  weakSkill: SkillScore | null;
  message: string;
  recommended: PbEntry[];
}

export interface Dataset {
  profile: Profile;
  generatedAt: string;
  days: DayEntry[];
  pbs: PbEntry[];
  focus: FocusResult;
}

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayStartIso(date: string): string {
  // 'date' es YYYY-MM-DD en zona local (Colombia UTC-5).
  // Convertir medianoche local a UTC para que el filtro ended_at coincida con el día real del usuario.
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toISOString();
}

function dayEndIso(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + 1);
  return dt.toISOString();
}

function weekdayLabel(date: string): string {
  const names = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const idx = new Date(`${date}T12:00:00`).getDay();
  return names[idx];
}

function isVT(name: string): boolean {
  return name.toLowerCase().startsWith('vt ');
}

/** true = solo escenarios del catálogo Voltaic; false = todos los escenarios */
const VT_ONLY = env('AIMLAB_VT_ONLY', '0') === '1';

export function summarize(row: DayTaskRow): TaskSummary {
  const sc = findScenario(row.taskId);
  const cat = sc ? sc.category_id : -1;
  const sub = sc ? sc.subcategory_id : -1;
  const rank = sc ? rankForScenario(sc, row.bestScore) : null;
  return {
    ...row,
    category: sc ? categoryName(cat) : 'other',
    subcategory: sc ? subcategoryName(cat, sub) : 'other',
    subcategoryColor: subcategoryColor(cat, sub),
    tierName: rank?.tierName ?? '?',
    rank: rank?.rank ?? null,
    rankColor: rankColor(rank?.rank ?? null),
    nextRank: rank?.nextRank ?? null,
    progress: rank?.progress ?? null,
    thresholds: rank?.thresholds ?? [],
  };
}

const SKILL_TO_CATEGORIES: Record<string, number[]> = {
  tracking: [6],
  perception: [6],
  speed: [5],
  cognition: [5],
  precision: [4],
  flicking: [4],
};

export function computeFocus(
  skillScores: SkillScore[],
  pbs: PbEntry[],
): FocusResult {
  if (skillScores.length === 0) {
    return { weakSkill: null, message: 'Sin datos de habilidades.', recommended: [] };
  }
  const weak = [...skillScores].sort((a, b) => a.score - b.score)[0];
  const catIds = SKILL_TO_CATEGORIES[weak.name] ?? [];
  const inCat = pbs.filter(
    (p) =>
      p.bestScore != null &&
      catIds.includes(
        findScenario(p.taskId)?.category_id ?? -1,
      ),
  );
  const recommended = inCat
    .sort((a, b) => (a.bestAccuracy ?? 0) - (b.bestAccuracy ?? 0))
    .slice(0, 3);
  const catNames = catIds
    .map((id) => (id === 4 ? 'flick-tech' : id === 5 ? 'micros' : 'stability'))
    .join(' / ');
  const message = `Tu habilidad más débil es ${weak.name} (${Math.round(weak.score)}/100). Concéntrate en las categorías ${catNames}.`;
  return { weakSkill: weak, message, recommended };
}

export async function buildDataset(days = CONFIG.defaultDays): Promise<Dataset> {
  const profile = await getProfile(CONFIG.username);

  const today = new Date();
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    dates.push(isoDay(d));
  }

  const dayRows = await Promise.all(
    dates.map((date) =>
      getDayTasks(CONFIG.userId, dayStartIso(date), dayEndIso(date)).then(
        (rows) => ({ date, rows: VT_ONLY ? rows.filter((r) => isVT(r.taskName)) : rows }),
      ),
    ),
  );

  const daysOut: DayEntry[] = dayRows.map(({ date, rows }) => {
    const tasks: TaskSummary[] = rows.map(summarize);
    const byTask: Record<string, TaskSummary> = {};
    for (const t of tasks) byTask[t.taskId] = t;
    return {
      date,
      label: `${date.slice(5)} ${weekdayLabel(date)}`,
      runs: tasks.reduce((acc, t) => acc + t.runs, 0),
      scenariosPlayed: tasks.length,
      tasks,
      byTask,
    };
  });

  const allTime = await getDayTasks(
    CONFIG.userId,
    '2000-01-01T00:00:00Z',
    '2100-01-01T00:00:00Z',
  );
  const pbs: PbEntry[] = allTime
    .filter((row) => !VT_ONLY || isVT(row.taskName))
    .map((row) => {
      const s = summarize(row);
      return {
        taskId: row.taskId,
        taskName: row.taskName,
        category: s.category,
        subcategory: s.subcategory,
        subcategoryColor: s.subcategoryColor,
        tierName: s.tierName,
        bestScore: row.bestScore > 0 ? row.bestScore : null,
        bestAccuracy: row.bestAccuracy,
        runs: row.runs,
        rank: s.rank,
        rankColor: s.rankColor,
        nextRank: s.nextRank,
        progress: s.progress,
        thresholds: s.thresholds,
      };
    });

  const focus = computeFocus(profile.skillScores, pbs);

  return {
    profile,
    generatedAt: new Date().toISOString(),
    days: daysOut,
    pbs,
    focus,
  };
}