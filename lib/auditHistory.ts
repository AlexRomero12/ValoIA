import type { AuditDay } from './audit';

/**
 * Tipos y helpers puros de la copia histórica de auditoría.
 * SIN `node:fs`: este módulo se importa desde el client bundle (la página
 * /auditoria). La lectura/escritura en disco vive en `auditHistoryStore.ts`.
 */

export interface StoredAuditDay {
  key: string;
  label: string;
  dayStart: number;
  matches: number;
  realRR: number | null;
  planRR: number | null;
  planPoolRR: number | null;
  rrCoverage: boolean;
  rrMissing: number;
  violationCount: number;
  violationCost: number | null;
  cutAt: string | null;
  cutIgnored: boolean;
  sessions: number;
  savedAt: number;
}

/** Snapshot de un día auditado (para persistir). */
export function toStoredAuditDay(d: AuditDay): StoredAuditDay {
  return {
    key: d.key,
    label: d.label,
    dayStart: d.dayStart,
    matches: d.matches.length,
    realRR: d.realRR,
    planRR: d.planRR,
    planPoolRR: d.planPoolRR,
    rrCoverage: d.rrCoverage,
    rrMissing: d.rrMissing,
    violationCount: d.violationCount,
    violationCost: d.violationCost,
    cutAt: d.cutAt,
    cutIgnored: d.cutIgnored,
    sessions: d.sessions,
    savedAt: Date.now(),
  };
}

/** Reconstruye un AuditDay desde la copia guardada (sin detalle por partida). */
export function storedToAuditDay(s: StoredAuditDay): AuditDay {
  return {
    key: s.key,
    label: s.label,
    dayStart: s.dayStart,
    matches: [],
    realRR: s.realRR,
    planRR: s.planRR,
    planPoolRR: s.planPoolRR,
    rrCoverage: s.rrCoverage,
    rrMissing: s.rrMissing,
    violationCount: s.violationCount,
    violationCost: s.violationCost,
    cutAt: s.cutAt,
    cutIgnored: s.cutIgnored,
    sessions: s.sessions,
    stored: true,
    storedMatches: s.matches,
  };
}

/** Compara contenido (sin savedAt) para no regrabar snapshots idénticos. */
export function sameAuditDay(a: StoredAuditDay, b: StoredAuditDay): boolean {
  return (
    a.matches === b.matches &&
    a.realRR === b.realRR &&
    a.planRR === b.planRR &&
    a.planPoolRR === b.planPoolRR &&
    a.violationCount === b.violationCount &&
    a.violationCost === b.violationCost &&
    a.cutAt === b.cutAt &&
    a.cutIgnored === b.cutIgnored &&
    a.sessions === b.sessions
  );
}