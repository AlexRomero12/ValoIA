import { readData, writeData } from './persist';

/**
 * Historial RR por partida (server-only, usa `node:fs` vía persist).
 *
 * El mmr-history de Henrik solo cubre las últimas ~20 competitivas: cuando una
 * partida sale de esa ventana, su RR deja de ser recuperable desde la API y el
 * historial la mostraba sin puntos (`—`). Aquí se acumula el RR observado por
 * partida (tier/rr/last_change/elo/season) alimentado desde cada resumen, y se
 * usa como fuente cuando el match ya no está en la ventana. No implica requests
 * extra: se reutiliza el mmr-history que el resumen ya descargó.
 *
 * Durabilidad: mismo patrón que favoritas/reglas — `data/rr-history.json`
 * (volumen Docker `valo-data`), externo al cache, con writes atómicos.
 * Clave por cuenta: `${name}_${tag}`.
 */

export interface RrSnapshot {
  match_id: string;
  tier?: { id?: number; name?: string };
  season?: { id?: string; short?: string };
  rr?: number;
  last_change?: number;
  elo?: number;
  date?: string;
  /** ms epoch de la última vez que se observó (solo para el descarte por techo) */
  at: number;
}

interface RrHistoryFile {
  version: number;
  players: Record<string, Record<string, RrSnapshot>>;
}

const HISTORY_FILE = 'rr-history.json';
/** Techo por cuenta: una entrada por competitiva es pequeña, pero evita crecimiento sin fin. */
const MAX_ENTRIES_PER_PLAYER = 5000;

let mem: RrHistoryFile | null = null;

function load(): RrHistoryFile {
  if (mem) return mem;
  const file = readData<RrHistoryFile>(HISTORY_FILE, { version: 1, players: {} });
  mem = file && typeof file.players === 'object' && file.players ? file : { version: 1, players: {} };
  return mem;
}

function playerKey(nameArg: string, tagArg: string): string {
  const clean = (v: string) => v.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${clean(nameArg)}_${clean(tagArg)}`;
}

/** Campo a campo para no reescribir el archivo si nada cambió (el `at` no cuenta). */
function same(a: RrSnapshot | undefined, b: RrSnapshot): boolean {
  if (!a) return false;
  return (
    a.tier?.id === b.tier?.id &&
    a.tier?.name === b.tier?.name &&
    a.season?.short === b.season?.short &&
    a.rr === b.rr &&
    a.last_change === b.last_change &&
    a.elo === b.elo &&
    a.date === b.date
  );
}

/**
 * Upsert de las entradas observadas en un resumen. Solo reescribe si algo
 * cambió. Devuelve cuántas se insertaron/actualizaron.
 */
export function mergeRrHistory(nameArg: string, tagArg: string, entries: RrSnapshot[]): number {
  if (!entries.length) return 0;
  const file = load();
  const key = playerKey(nameArg, tagArg);
  const bucket = file.players[key] ?? {};
  let changed = 0;

  for (const e of entries) {
    if (!e.match_id) continue;
    if (same(bucket[e.match_id], e)) continue;
    bucket[e.match_id] = e;
    changed += 1;
  }
  if (!changed) return 0;

  const ids = Object.keys(bucket);
  if (ids.length > MAX_ENTRIES_PER_PLAYER) {
    ids.sort((a, b) => (bucket[a].at ?? 0) - (bucket[b].at ?? 0));
    for (const id of ids.slice(0, ids.length - MAX_ENTRIES_PER_PLAYER)) delete bucket[id];
  }

  file.players[key] = bucket;
  mem = file;
  writeData(HISTORY_FILE, file);
  return changed;
}

/** RR acumulado de una cuenta (match_id -> snapshot). */
export function getRrHistory(nameArg: string, tagArg: string): Record<string, RrSnapshot> {
  return load().players[playerKey(nameArg, tagArg)] ?? {};
}
