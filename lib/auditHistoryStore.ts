import { readData, writeData } from './persist';
import type { StoredAuditDay } from './auditHistory';

/**
 * Persistencia de la copia histórica de auditoría (server-only, usa `node:fs`).
 *
 * El mmr-history de Henrik solo cubre las últimas ~20 competitivas: cuando un
 * día sale de esa ventana, su RR deja de ser recuperable desde la API. Aquí se
 * guarda el snapshot del día (RR real / con regla / regla+pool, violaciones,
 * cortes) en el momento en que estaba COMPLETO, para mostrarlo aunque la API
 * ya no lo devuelva.
 *
 * Durabilidad: mismo patrón que favoritas/comentarios — `data/audit-history.json`
 * (volumen Docker `valo-data`), externo al cache, con writes atómicos.
 */

interface AuditHistoryFile {
  version: number;
  days: Record<string, StoredAuditDay>;
}

const HISTORY_FILE = 'audit-history.json';

function readHistory(): Record<string, StoredAuditDay> {
  const file = readData<AuditHistoryFile>(HISTORY_FILE, { version: 1, days: {} });
  return file?.days && typeof file.days === 'object' ? file.days : {};
}

export async function getAuditHistory(): Promise<Record<string, StoredAuditDay>> {
  return readHistory();
}

/** Upsert de días (por key). Devuelve el estado completo. */
export async function upsertAuditDays(days: StoredAuditDay[]): Promise<Record<string, StoredAuditDay>> {
  const current = readHistory();
  const next = { ...current };
  for (const d of days) {
    if (d && d.key) next[d.key] = d;
  }
  writeData(HISTORY_FILE, { version: 1, days: next });
  return next;
}