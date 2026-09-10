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
 * Clave por perfil: `${profileId}:${YYYY-MM-DD}`. Los snapshots viejos (sin
 * prefijo, solo de Player) se migran una vez a `player:`.
 *
 * Durabilidad: mismo patrón que favoritas/comentarios — `data/audit-history.json`
 * (volumen Docker `valo-data`), externo al cache, con writes atómicos.
 */

interface AuditHistoryFile {
  version: number;
  days: Record<string, StoredAuditDay>;
}

const HISTORY_FILE = 'audit-history.json';
const LEGACY_PROFILE = 'player';

function migrate(days: Record<string, StoredAuditDay>): { days: Record<string, StoredAuditDay>; changed: boolean } {
  let changed = false;
  const out: Record<string, StoredAuditDay> = {};
  for (const [key, day] of Object.entries(days)) {
    if (!day) continue;
    if (key.includes(':')) {
      out[key] = day.profileId ? day : { ...day, profileId: key.split(':')[0] };
      continue;
    }
    // Legacy: snapshots de antes de existir perfiles -> eran de Player.
    changed = true;
    const profileId = day.profileId ?? LEGACY_PROFILE;
    out[`${profileId}:${key}`] = { ...day, key: `${profileId}:${key}`, profileId };
  }
  return { days: out, changed };
}

function readHistory(): Record<string, StoredAuditDay> {
  const file = readData<AuditHistoryFile>(HISTORY_FILE, { version: 1, days: {} });
  const raw = file?.days && typeof file.days === 'object' ? file.days : {};
  const { days, changed } = migrate(raw);
  if (changed) writeData(HISTORY_FILE, { version: 2, days });
  return days;
}

export async function getAuditHistory(): Promise<Record<string, StoredAuditDay>> {
  return readHistory();
}

/** Upsert de días (por key compuesta). Devuelve el estado completo. */
export async function upsertAuditDays(days: StoredAuditDay[]): Promise<Record<string, StoredAuditDay>> {
  const current = readHistory();
  const next = { ...current };
  for (const d of days) {
    if (d && d.key) next[d.key] = d;
  }
  writeData(HISTORY_FILE, { version: 2, days: next });
  return next;
}
