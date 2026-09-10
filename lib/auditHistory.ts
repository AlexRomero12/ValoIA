import type { AuditDay } from './audit';

/**
 * Tipos y helpers puros de la copia histórica de auditoría.
 * SIN `node:fs`: este módulo se importa desde el client bundle (la página
 * /auditoria). La lectura/escritura en disco vive en `auditHistoryStore.ts`.
 *
 * Clave del snapshot: `${profileId}:${YYYY-MM-DD}` — cada perfil tiene su
 * historial independiente. Snapshots viejos sin prefijo se asignan al primer
 * perfil del dueño.
 */

export interface StoredAuditDay {
  /** `${profileId}:${YYYY-MM-DD}` */
  key: string;
  profileId: string;
  /** Versión de reglas con la que se evaluó el día (editar reglas no reescribe el pasado) */
  rulesVersion?: number;
  label: string;
  dayStart: number;
  matches: number;
  realRR: number | null;
  planRR: number | null;
  planPoolRR: number | null;
  rrCoverage: boolean;
  rrMissing: number;
  violationCount: number;
  /** Partidas con agente/rol prohibido (se conserva en snapshots nuevos) */
  bannedCount?: number;
  violationCost: number | null;
  violationLoss: number | null;
  violationGain: number | null;
  cutAt: string | null;
  cutIgnored: boolean;
  sessions: number;
  savedAt: number;
}

/** Clave compuesta de un día guardado. */
export function storedDayKey(profileId: string, day: string): string {
  return `${profileId}:${day}`;
}

/** Día (`YYYY-MM-DD`) a partir de una clave compuesta (o la clave misma si es legacy). */
export function storedDayOf(key: string): string {
  const i = key.indexOf(':');
  return i >= 0 ? key.slice(i + 1) : key;
}

/** Snapshot de un día auditado (para persistir). */
export function toStoredAuditDay(d: AuditDay, profileId: string, rulesVersion?: number): StoredAuditDay {
  return {
    key: storedDayKey(profileId, d.key),
    profileId,
    rulesVersion,
    label: d.label,
    dayStart: d.dayStart,
    matches: d.matches.length,
    realRR: d.realRR,
    planRR: d.planRR,
    planPoolRR: d.planPoolRR,
    rrCoverage: d.rrCoverage,
    rrMissing: d.rrMissing,
    violationCount: d.violationCount,
    bannedCount: d.bannedCount,
    violationCost: d.violationCost,
    violationLoss: d.violationLoss,
    violationGain: d.violationGain,
    cutAt: d.cutAt,
    cutIgnored: d.cutIgnored,
    sessions: d.sessions,
    savedAt: Date.now(),
  };
}

/** Reconstruye un AuditDay desde la copia guardada (sin detalle por partida). */
export function storedToAuditDay(s: StoredAuditDay): AuditDay {
  return {
    key: storedDayOf(s.key),
    label: s.label,
    dayStart: s.dayStart,
    matches: [],
    realRR: s.realRR,
    planRR: s.planRR,
    planPoolRR: s.planPoolRR,
    rrCoverage: s.rrCoverage,
    rrMissing: s.rrMissing,
    violationCount: s.violationCount,
    bannedCount: s.bannedCount ?? 0,
    violationCost: s.violationCost,
    // Migración de snapshots viejos (sin split): el neto se asigna al lado
    // de su signo para no inventar un desglose que no se guardó.
    violationLoss: s.violationLoss ?? (s.violationCost != null && s.violationCost < 0 ? s.violationCost : null),
    violationGain: s.violationGain ?? (s.violationCost != null && s.violationCost > 0 ? s.violationCost : null),
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
    a.violationLoss === b.violationLoss &&
    a.violationGain === b.violationGain &&
    a.cutAt === b.cutAt &&
    a.cutIgnored === b.cutIgnored &&
    a.sessions === b.sessions
  );
}