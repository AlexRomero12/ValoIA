import type { MatchRow } from './types';
import { agentRole } from './roles';
import { poolRuleFor, type AuditRules } from './profileTypes';

/**
 * Motor de auditoría de sesión (Reglas de sesión, plan_mejora_player.md).
 *
 * Regla de parada: N derrotas seguidas con K/D < X = cerrar sesión
 * (default 2 derrotas con K/D < 0.9).
 * - Solo una VICTORIA reinicia el contador.
 * - Empates y derrotas con K/D >= X no reinician ni cancelan la cadena.
 * - Sesión nueva = pausa >= gap entre partidas (default 3 h; el contador arranca en 0).
 *
 * Pool: cada partida se clasifica como main / backup / fuera / prohibido según
 * las reglas del perfil (`AuditRules`); fuera y prohibido son violación.
 */

export interface AuditPool {
  main: string[];
  backup: string[];
}

/** Pool por defecto (histórico de Player) cuando el perfil no define reglas. */
export const AUDIT_POOL: AuditPool = {
  main: ['Jett', 'Raze', 'Chamber'],
  backup: ['Sage', 'Astra'],
};

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
export function classifyPick(m: MatchRow, rules?: AuditRules): PickClass {
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

/** Violación de pool plana (compat): agente fuera de main+backup. */
export function isPoolViolation(m: MatchRow, pool: AuditPool = AUDIT_POOL): boolean {
  return !pool.main.includes(m.agent) && !pool.backup.includes(m.agent);
}

export interface AuditMatchRow {
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

export interface AuditDay {
  key: string;
  label: string;
  dayStart: number;
  /** Partidas en orden cronológico. */
  matches: AuditMatchRow[];
  /** RR neto real del día (suma de los rrDelta disponibles; null si ninguno tenía dato). */
  realRR: number | null;
  /** RR si se hubiera respetado la regla de parada (sin partidas posteriores al corte). */
  planRR: number | null;
  /** RR con regla + pool estricto (sin violaciones). */
  planPoolRR: number | null;
  /** true si TODOS los rrDelta del día estaban disponibles. */
  rrCoverage: boolean;
  /** Cuántos rrDelta faltaban en el día (sumas parciales). */
  rrMissing: number;
  violationCount: number;
  /** Partidas con agente prohibido (agente o rol vetado). */
  bannedCount: number;
  /**
   * Balance neto de las violaciones (puede ser positivo: una victoria fuera
   * de pool suma). Para el "costo" real ver violationLoss.
   */
  violationCost: number | null;
  /** RR perdido en violaciones (solo deltas negativos, ≤ 0). */
  violationLoss: number | null;
  /** RR ganado en violaciones (solo deltas positivos, ≥ 0). */
  violationGain: number | null;
  /** Hora local del corte (p. ej. "14:11") o null si no se activó la regla. */
  cutAt: string | null;
  /** true si hubo corte y aun así se siguió jugando. */
  cutIgnored: boolean;
  sessions: number;
  /** true si los RR vienen de la copia histórica guardada (la API ya no los da). */
  stored?: boolean;
  /** Nº de partidas según la copia histórica (para semanas sin datos en vivo). */
  storedMatches?: number;
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

function sumRR(rows: AuditMatchRow[], filter: (r: AuditMatchRow) => boolean): { sum: number | null; coverage: boolean; missing: number } {
  let sum = 0;
  let present = 0;
  let missing = 0;
  for (const r of rows) {
    if (!filter(r)) continue;
    if (r.match.rrDelta == null) {
      missing += 1;
      continue;
    }
    sum += r.match.rrDelta;
    present += 1;
  }
  return { sum: present ? sum : null, coverage: missing === 0, missing };
}

/** Audita las competitivas de un día (entrada ya filtrada a competitive + completadas). */
export function auditDay(matches: MatchRow[], rules?: AuditRules): AuditDay {
  const stopKd = rules?.stop.kdBelow ?? STOP_KD;
  const stopLosses = Math.max(1, Math.floor(rules?.stop.losses ?? 2));
  const sessionGapMs = Math.max(1, rules?.sessions.gapMinutes ?? SESSION_GAP_MS / 60_000) * 60_000;
  const sorted = [...matches].sort((a, b) => a.timestamp - b.timestamp);
  const key = sorted.length ? isoDayLocal(sorted[0].timestamp) : '?';
  const dayStart = sorted.length ? new Date(sorted[0].timestamp).setHours(0, 0, 0, 0) : 0;

  const rows: AuditMatchRow[] = [];
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

  const real = sumRR(rows, () => true);
  const plan = sumRR(rows, (r) => !r.afterCut);
  const planPool = sumRR(rows, (r) => !r.afterCut && !r.violation);

  const violations = rows.filter((r) => r.violation);
  const splitRR = (pred: (d: number) => boolean): number | null => {
    let sum = 0;
    let present = 0;
    for (const r of violations) {
      const d = r.match.rrDelta;
      if (d == null || !pred(d)) continue;
      sum += d;
      present += 1;
    }
    return present ? sum : null;
  };
  const violationCost = splitRR(() => true);
  // Costo = solo lo perdido (≤ 0): una victoria fuera de pool (+15) no es un
  // costo y antes se pintaba en rojo como si lo fuera. El neto queda en
  // violationCost y lo ganado en violationGain.
  const violationLoss = splitRR((d) => d < 0);
  const violationGain = splitRR((d) => d > 0);

  const cutIdx = rows.findIndex((r) => r.cutPoint);

  return {
    key,
    label: sorted.length ? localLabel(sorted[0].timestamp) : key,
    dayStart,
    matches: rows,
    realRR: real.sum,
    planRR: plan.sum,
    planPoolRR: planPool.sum,
    rrCoverage: real.coverage,
    rrMissing: real.missing,
    violationCount: violations.length,
    bannedCount: rows.filter((r) => r.pickClass === 'banned').length,
    violationCost,
    violationLoss,
    violationGain,
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

export interface AuditWeek {
  key: string;
  label: string;
  days: AuditDay[];
  matches: number;
  realRR: number | null;
  planRR: number | null;
  planPoolRR: number | null;
  violationCount: number;
  bannedCount: number;
  violationCost: number | null;
  violationLoss: number | null;
  violationGain: number | null;
  cutsTotal: number;
  cutsIgnored: number;
  /** true si algún día de la semana tenía rrDelta faltantes (sumas parciales). */
  rrPartial: boolean;
}

/** Agrega días en semanas (lun-dom). Los días deben venir en orden cronológico. */
export function groupAuditWeeks(days: AuditDay[]): AuditWeek[] {
  const byWeek = new Map<string, AuditDay[]>();
  for (const d of days) {
    const mo = mondayOf(d.dayStart);
    const key = `w-${mo.getFullYear()}-${String(mo.getMonth() + 1).padStart(2, '0')}-${String(mo.getDate()).padStart(2, '0')}`;
    const list = byWeek.get(key) ?? [];
    list.push(d);
    byWeek.set(key, list);
  }
  return [...byWeek.entries()]
    .map(([key, list]) => {
      const sum = (pick: (d: AuditDay) => number | null): number | null => {
        const vals = list.map(pick).filter((v): v is number => v != null);
        return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
      };
      return {
        key,
        label: key.slice(2).replace(/-/g, ' · '),
        days: [...list].sort((a, b) => a.dayStart - b.dayStart),
        matches: list.reduce((a, d) => a + (d.matches.length || (d.storedMatches ?? 0)), 0),
        realRR: sum((d) => d.realRR),
        planRR: sum((d) => d.planRR),
        planPoolRR: sum((d) => d.planPoolRR),
        violationCount: list.reduce((a, d) => a + d.violationCount, 0),
        bannedCount: list.reduce((a, d) => a + d.bannedCount, 0),
        violationCost: sum((d) => d.violationCost),
        violationLoss: sum((d) => d.violationLoss),
        violationGain: sum((d) => d.violationGain),
        cutsTotal: list.filter((d) => d.cutAt != null).length,
        cutsIgnored: list.filter((d) => d.cutIgnored).length,
        rrPartial: list.some((d) => !d.rrCoverage),
      };
    })
    .sort((a, b) => (a.key < b.key ? -1 : 1));
}