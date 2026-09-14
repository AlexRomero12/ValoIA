import { readData, writeData } from './persist';
import { listProfiles } from './profiles';
import type { StoredRulesDay } from './rulesHistory';

/**
 * Persistencia de la copia histórica de reglas (server-only, usa `node:fs`).
 *
 * El bucket de partidas solo cubre una ventana reciente: cuando un día sale de
 * esa ventana, su evaluación completa ya no es recuperable desde la API. Aquí
 * se guarda el snapshot del día (récord V/D/E real / con regla / regla+pool,
 * violaciones, cortes y tiers) en el momento en que estaba COMPLETO, para
 * mostrarlo aunque la API ya no lo devuelva.
 *
 * Clave por perfil: `${profileId}:${YYYY-MM-DD}`. Los snapshots viejos (sin
 * prefijo, de la época sin perfiles) se asignan una vez al primer perfil.
 *
 * Durabilidad: mismo patrón que comentarios — `data/rules-history.json`
 * (volumen Docker `valo-data`), externo al cache, con writes atómicos.
 */

interface RulesHistoryFile {
  version: number;
  days: Record<string, StoredRulesDay>;
}

const HISTORY_FILE = 'rules-history.json';
/** Archivo previo al rename: se migra a `rules-history.json` en la primera lectura. */
const LEGACY_HISTORY_FILE = 'audit-history.json';

function migrate(days: Record<string, StoredRulesDay>): { days: Record<string, StoredRulesDay>; changed: boolean } {
  let changed = false;
  const out: Record<string, StoredRulesDay> = {};
  for (const [key, day] of Object.entries(days)) {
    if (!day) continue;
    if (key.includes(':')) {
      out[key] = day.profileId ? day : { ...day, profileId: key.split(':')[0] };
      continue;
    }
    // Legacy: snapshots de antes de existir perfiles -> primer perfil.
    const profileId = day.profileId ?? listProfiles()[0]?.id;
    if (!profileId) continue;
    changed = true;
    out[`${profileId}:${key}`] = { ...day, key: `${profileId}:${key}`, profileId };
  }
  return { days: out, changed };
}

function readHistory(): Record<string, StoredRulesDay> {
  let file = readData<RulesHistoryFile>(HISTORY_FILE, { version: 2, days: {} });
  if (!file?.days || Object.keys(file.days).length === 0) {
    const legacy = readData<RulesHistoryFile>(LEGACY_HISTORY_FILE, { version: 2, days: {} });
    if (legacy?.days && Object.keys(legacy.days).length > 0) {
      file = { version: 2, days: legacy.days };
      writeData(HISTORY_FILE, file);
    }
  }
  const raw = file?.days && typeof file.days === 'object' ? file.days : {};
  const { days, changed } = migrate(raw);
  if (changed) writeData(HISTORY_FILE, { version: 2, days });
  return days;
}

export async function getRulesHistory(): Promise<Record<string, StoredRulesDay>> {
  return readHistory();
}

/** Upsert de días (por key compuesta). Devuelve el estado completo. */
export async function upsertRulesDays(days: StoredRulesDay[]): Promise<Record<string, StoredRulesDay>> {
  const current = readHistory();
  const next = { ...current };
  for (const d of days) {
    if (d && d.key) next[d.key] = d;
  }
  writeData(HISTORY_FILE, { version: 2, days: next });
  return next;
}
