import type { MatchRow } from './types';
import { agentRole } from './roles';
import { poolRuleFor, type SessionRules } from './profileTypes';

/**
 * Motor de reglas de sesión (reglas configurables por perfil).
 *
 * Regla de parada: N derrotas seguidas con K/D < X = cerrar sesión
 * (default 2 derrotas con K/D < 0.9).
 * - Solo una VICTORIA reinicia el contador.
 * - Empates y derrotas con K/D >= X no reinician ni cancelan la cadena.
 * - Sesión nueva = pausa >= gap entre partidas (default 3 h; el contador arranca en 0).
 *
 * Pool: cada partida se clasifica como main / backup / fuera / prohibido según
 * las reglas del perfil (`SessionRules`); fuera y prohibido son violación.
 *
 * Sin RR: la API oficial no lo expone. El progreso se mide con récord V/D/E y
 * tier (que sí viene en cada partida).
 */

/** Clasificación de un pick contra las reglas del perfil. */
export type PickClass = 'main' | 'backup' | 'off' | 'banned' | 'flex';

/** Pausa >= 3 h entre partidas = sesión nueva (default). */
export const SESSION_GAP_MS = 3 * 60 * 60 * 1000;
/** Umbral de la regla de parada (default). */
export const STOP_KD = 0.9;

export function isDraw(m: MatchRow): boolean {
  return m.roundsWon === m.roundsLost;
}

export function matchKd(m: MatchRow): number {
  return m.deaths ? m.kills / m.deaths : m.kills > 0 ? m.kills : 0;
}

/** Clasifica el agente de una partida contra las reglas (flex = sin regla). */
export function classifyPick(m: MatchRow, rules?: SessionRules): PickClass {
  if (!rules) return 'flex';
  if ((rules.bannedAgents ?? []).includes(m.agent)) return 'banned';
  const role = m.agentRole ?? agentRole(m.agent);
  if (role && (rules.bannedRoles ?? []).includes(role)) return 'banned';
  const rule = poolRuleFor(rules, m.map);
  if (!rule) return 'flex';
  if (rule.main.includes(m.agent)) return 'main';
  if (rule.backup.includes(m.agent)) return 'backup';
  return 'off';
}

export interface EvaluatedMatch {
  match: MatchRow;
  kd: number;
  /** Contador de la regla tras esta partida (0-2 típicamente). */
  counterAfter: number;
  /** Clasificación del pick contra las reglas del perfil. */
  pickClass: PickClass;
  /** Agente fuera de pool (competitiva). */
  violation: boolean;
  /** Partida donde el contador llegó al umbral (aquí se corta; esta no se cuenta como "no debiste"). */
  cutPoint: boolean;
  /** Posterior al punto de corte (no debiste jugarla). */
  afterCut: boolean;
  /** Índice de sesión dentro del día (0 = primera). */
  session: number;
}

export interface DayEvaluation {
  key: string;
  label: string;
  dayStart: number;
  /** Partidas en orden cronológico. */
  matches: EvaluatedMatch[];
  /** Récord real del día (todas las partidas). */
  wins: number;
  losses: number;
  draws: number;
  /** Récord si se hubiera respetado la regla de parada (sin partidas posteriores al corte). */
  planWins: number;
  planLosses: number;
  planDraws: number;
  /** Récord con regla + pool estricto (sin violaciones). */
  poolWins: number;
  poolLosses: number;
  poolDraws: number;
  /** Récord de las partidas que violaron el pool. */
  violationWins: number;
  violationLosses: number;
  violationDraws: number;
  /** Tier al inicio del día (primera partida). */
  startTier: number;
  /** Tier al final del día (última partida). */
  endTier: number;
  /** Tier al respetar la regla de parada (última partida permitida). */
  planTier: number;
  /** Tier con regla + pool estricto. */
  poolTier: number;
  violationCount: number;
  /** Partidas con agente prohibido (agente o rol vetado). */
  bannedCount: number;
  /** Hora local del corte (p. ej. "14:11") o null si no se activó la regla. */
  cutAt: string | null;
  /** true si hubo corte y aun así se siguió jugando. */
  cutIgnored: boolean;
  sessions: number;
  /** true si el día viene de la copia histórica guardada. */
  stored?: boolean;
  /** Nº de partidas según la copia histórica (para semanas sin datos en vivo). */
  storedMatches?: number;
  /** Primeras sangres del día (solo partidas con detalle de kill feed). */
  fbTotal?: number | null;
  /** Primeras muertes del día (solo partidas con detalle de kill feed). */
  fdTotal?: number | null;
  /** Partidas del día con 3+ primeras muertes (señal "no regalar"). */
  fdHighCount?: number;
}

function isoDayLocal(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function localLabel(ts: number): string {
  return new Date(ts).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
}

function hourLocal(ts: number): string {
  return new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

interface Record3 {
  wins: number;
  losses: number;
  draws: number;
}

function recordOf(rows: EvaluatedMatch[], filter: (r: EvaluatedMatch) => boolean): Record3 {
  const out: Record3 = { wins: 0, losses: 0, draws: 0 };
  for (const r of rows) {
    if (!filter(r)) continue;
    if (isDraw(r.match)) out.draws += 1;
    else if (r.match.won) out.wins += 1;
    else out.losses += 1;
  }
  return out;
}

/** Evalúa las competitivas de un día (entrada ya filtrada a competitive + completadas). */
export function evaluateDay(matches: MatchRow[], rules?: SessionRules): DayEvaluation {
  const stopKd = rules?.stop.kdBelow ?? STOP_KD;
  const stopLosses = Math.max(1, Math.floor(rules?.stop.losses ?? 2));
  const sessionGapMs = Math.max(1, rules?.sessions.gapMinutes ?? SESSION_GAP_MS / 60_000) * 60_000;
  const sorted = [...matches].sort((a, b) => a.timestamp - b.timestamp);
  const key = sorted.length ? isoDayLocal(sorted[0].timestamp) : '?';
  const dayStart = sorted.length ? new Date(sorted[0].timestamp).setHours(0, 0, 0, 0) : 0;

  const rows: EvaluatedMatch[] = [];
  let session = 0;
  let counter = 0;
  let cutAtIdx = -1;

  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i];
    const prev = sorted[i - 1];
    if (prev && m.timestamp - prev.timestamp >= sessionGapMs) {
      session += 1;
      counter = 0;
    }
    const kd = matchKd(m);
    const draw = isDraw(m);
    if (!draw) {
      if (m.won) counter = 0;
      else if (kd < stopKd) counter = Math.min(stopLosses, counter + 1);
      // derrota con K/D >= umbral: no reinicia ni cancela
    }
    const cutPoint = counter >= stopLosses && cutAtIdx === -1;
    if (cutPoint) cutAtIdx = i;
    const pickClass = classifyPick(m, rules);
    rows.push({
      match: m,
      kd,
      counterAfter: counter,
      pickClass,
      violation: pickClass === 'off' || pickClass === 'banned',
      cutPoint,
      afterCut: cutAtIdx !== -1 && i > cutAtIdx,
      session,
    });
  }

  const real = recordOf(rows, () => true);
  const plan = recordOf(rows, (r) => !r.afterCut);
  const pool = recordOf(rows, (r) => !r.afterCut && !r.violation);
  const violations = recordOf(rows, (r) => r.violation);

  const cutIdx = rows.findIndex((r) => r.cutPoint);
  const lastAllowed = cutIdx >= 0 ? rows.slice(0, cutIdx + 1) : rows;
  const planTier = lastAllowed.length ? lastAllowed[lastAllowed.length - 1].match.tier : 0;
  const poolRows = lastAllowed.filter((r) => !r.violation);
  const poolTier = poolRows.length ? poolRows[poolRows.length - 1].match.tier : 0;

  // Impacto (FB/FD): solo cuenta partidas con detalle de kill feed.
  const impactRows = rows.filter((r) => r.match.firstBloods != null && r.match.firstDeaths != null);
  const fbTotal = impactRows.length ? impactRows.reduce((a, r) => a + (r.match.firstBloods ?? 0), 0) : null;
  const fdTotal = impactRows.length ? impactRows.reduce((a, r) => a + (r.match.firstDeaths ?? 0), 0) : null;
  const fdHighCount = impactRows.filter((r) => (r.match.firstDeaths ?? 0) >= 3).length;

  const violationRows = rows.filter((r) => r.violation);

  return {
    key,
    label: sorted.length ? localLabel(sorted[0].timestamp) : key,
    fbTotal,
    fdTotal,
    fdHighCount,
    dayStart,
    matches: rows,
    wins: real.wins,
    losses: real.losses,
    draws: real.draws,
    planWins: plan.wins,
    planLosses: plan.losses,
    planDraws: plan.draws,
    poolWins: pool.wins,
    poolLosses: pool.losses,
    poolDraws: pool.draws,
    violationWins: violations.wins,
    violationLosses: violations.losses,
    violationDraws: violations.draws,
    startTier: rows.length ? rows[0].match.tier : 0,
    endTier: rows.length ? rows[rows.length - 1].match.tier : 0,
    planTier,
    poolTier,
    violationCount: violationRows.length,
    bannedCount: rows.filter((r) => r.pickClass === 'banned').length,
    cutAt: cutIdx >= 0 ? hourLocal(sorted[cutIdx].timestamp) : null,
    cutIgnored: cutIdx >= 0 && rows.some((r) => r.afterCut),
    sessions: session + 1,
  };
}

/** Lunes (local) de la semana de una fecha. */
export function mondayOf(ts: number): Date {
  const d = new Date(ts);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

export interface RulesWeek {
  key: string;
  label: string;
  days: DayEvaluation[];
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  planWins: number;
  planLosses: number;
  planDraws: number;
  poolWins: number;
  poolLosses: number;
  poolDraws: number;
  violationWins: number;
  violationLosses: number;
  violationCount: number;
  bannedCount: number;
  cutsTotal: number;
  cutsIgnored: number;
  /** Último tier conocido de la semana (0 si no hay datos). */
  endTier: number;
}

/** Agrega días en semanas (lun-dom). Los días deben venir en orden cronológico. */
export function groupEvaluationWeeks(days: DayEvaluation[]): RulesWeek[] {
  const byWeek = new Map<string, DayEvaluation[]>();
  for (const d of days) {
    const mo = mondayOf(d.dayStart);
    const key = `w-${mo.getFullYear()}-${String(mo.getMonth() + 1).padStart(2, '0')}-${String(mo.getDate()).padStart(2, '0')}`;
    const list = byWeek.get(key) ?? [];
    list.push(d);
    byWeek.set(key, list);
  }
  return [...byWeek.entries()]
    .map(([key, list]) => {
      const sum = (pick: (d: DayEvaluation) => number): number => list.reduce((a, d) => a + pick(d), 0);
      const ordered = [...list].sort((a, b) => a.dayStart - b.dayStart);
      const lastWithTier = [...ordered].reverse().find((d) => d.endTier > 0);
      return {
        key,
        label: key.slice(2).replace(/-/g, ' · '),
        days: ordered,
        matches: list.reduce((a, d) => a + (d.matches.length || (d.storedMatches ?? 0)), 0),
        wins: sum((d) => d.wins),
        losses: sum((d) => d.losses),
        draws: sum((d) => d.draws),
        planWins: sum((d) => d.planWins),
        planLosses: sum((d) => d.planLosses),
        planDraws: sum((d) => d.planDraws),
        poolWins: sum((d) => d.poolWins),
        poolLosses: sum((d) => d.poolLosses),
        poolDraws: sum((d) => d.poolDraws),
        violationWins: sum((d) => d.violationWins),
        violationLosses: sum((d) => d.violationLosses),
        violationCount: sum((d) => d.violationCount),
        bannedCount: sum((d) => d.bannedCount),
        cutsTotal: list.filter((d) => d.cutAt != null).length,
        cutsIgnored: list.filter((d) => d.cutIgnored).length,
        endTier: lastWithTier?.endTier ?? 0,
      };
    })
    .sort((a, b) => (a.key < b.key ? -1 : 1));
}
