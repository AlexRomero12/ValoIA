import type { DayEvaluation } from './rules';

/**
 * Tipos y helpers puros de la copia histórica de reglas.
 * SIN `node:fs`: este módulo se importa desde el client bundle (la página
 * /reglas). La lectura/escritura en disco vive en `rulesHistoryStore.ts`.
 *
 * Clave del snapshot: `${profileId}:${YYYY-MM-DD}` — cada perfil tiene su
 * historial independiente. Snapshots viejos sin prefijo se asignan al primer
 * perfil.
 *
 * Sin RR: la rama Riot guarda récord V/D/E y tiers. Los snapshots previos con
 * RR quedan inertes (sus campos ya no existen en el modelo).
 */

export interface StoredRulesDay {
  /** `${profileId}:${YYYY-MM-DD}` */
  key: string;
  profileId: string;
  /** Versión de reglas con la que se evaluó el día (editar reglas no reescribe el pasado) */
  rulesVersion?: number;
  label: string;
  dayStart: number;
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
  violationDraws: number;
  violationCount: number;
  /** Partidas con agente/rol prohibido (se conserva en snapshots nuevos) */
  bannedCount?: number;
  startTier?: number;
  endTier?: number;
  planTier?: number;
  poolTier?: number;
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

/** Snapshot de un día evaluado (para persistir). */
export function toStoredRulesDay(d: DayEvaluation, profileId: string, rulesVersion?: number): StoredRulesDay {
  return {
    key: storedDayKey(profileId, d.key),
    profileId,
    rulesVersion,
    label: d.label,
    dayStart: d.dayStart,
    matches: d.matches.length,
    wins: d.wins,
    losses: d.losses,
    draws: d.draws,
    planWins: d.planWins,
    planLosses: d.planLosses,
    planDraws: d.planDraws,
    poolWins: d.poolWins,
    poolLosses: d.poolLosses,
    poolDraws: d.poolDraws,
    violationWins: d.violationWins,
    violationLosses: d.violationLosses,
    violationDraws: d.violationDraws,
    violationCount: d.violationCount,
    bannedCount: d.bannedCount,
    startTier: d.startTier,
    endTier: d.endTier,
    planTier: d.planTier,
    poolTier: d.poolTier,
    cutAt: d.cutAt,
    cutIgnored: d.cutIgnored,
    sessions: d.sessions,
    savedAt: Date.now(),
  };
}

/** Reconstruye un DayEvaluation desde la copia guardada (sin detalle por partida). */
export function storedToRulesDay(s: StoredRulesDay): DayEvaluation {
  return {
    key: storedDayOf(s.key),
    label: s.label,
    dayStart: s.dayStart,
    matches: [],
    wins: s.wins ?? 0,
    losses: s.losses ?? 0,
    draws: s.draws ?? 0,
    planWins: s.planWins ?? 0,
    planLosses: s.planLosses ?? 0,
    planDraws: s.planDraws ?? 0,
    poolWins: s.poolWins ?? 0,
    poolLosses: s.poolLosses ?? 0,
    poolDraws: s.poolDraws ?? 0,
    violationWins: s.violationWins ?? 0,
    violationLosses: s.violationLosses ?? 0,
    violationDraws: s.violationDraws ?? 0,
    violationCount: s.violationCount,
    bannedCount: s.bannedCount ?? 0,
    startTier: s.startTier ?? 0,
    endTier: s.endTier ?? 0,
    planTier: s.planTier ?? 0,
    poolTier: s.poolTier ?? 0,
    cutAt: s.cutAt,
    cutIgnored: s.cutIgnored,
    sessions: s.sessions,
    stored: true,
    storedMatches: s.matches,
  };
}

/** Compara contenido (sin savedAt) para no regrabar snapshots idénticos. */
export function sameRulesDay(a: StoredRulesDay, b: StoredRulesDay): boolean {
  return (
    // La versión forma parte del snapshot: al cambiar reglas debe regrabarse
    // aunque la evaluación del día no cambie (evita quedar marcado como viejo).
    a.rulesVersion === b.rulesVersion &&
    a.matches === b.matches &&
    a.bannedCount === b.bannedCount &&
    a.wins === b.wins &&
    a.losses === b.losses &&
    a.draws === b.draws &&
    a.planWins === b.planWins &&
    a.planLosses === b.planLosses &&
    a.poolWins === b.poolWins &&
    a.poolLosses === b.poolLosses &&
    a.violationWins === b.violationWins &&
    a.violationLosses === b.violationLosses &&
    a.violationCount === b.violationCount &&
    a.endTier === b.endTier &&
    a.cutAt === b.cutAt &&
    a.cutIgnored === b.cutIgnored &&
    a.sessions === b.sessions
  );
}
