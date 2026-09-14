import fs from 'node:fs';
import path from 'node:path';
import { env } from './env';
import { matchIdOf, matchTimestamp, type MatchRecord } from './providers/types';

/**
 * Archivo acumulativo de partidas por jugador (modelo tracker.gg).
 *
 * El bucket de partidas (`riot:matches:v1`) es una ventana fresca de las
 * últimas 40: cuando el jugador juega más, las viejas salen de la API y con
 * ellas se perderían KPIs de ventanas largas, WR por agente/mapa, etc. Este
 * módulo es la contraparte persistente: TODA partida competitiva descargada se
 * guarda para siempre (una partida = un archivo JSON) junto con un índice
 * compacto por jugador.
 *
 * IMPORTANTE — durabilidad: este store es EXTERNO al cache L1/L2 (lib/cache.ts).
 * Vive en su propio directorio (`data/archive/`, configurable con ARCHIVE_DIR)
 * y NO se ve afectado por invalidateAll(), por el borrado manual de `.cache/`
 * ni por rotaciones/rebuilds del cache. Solo desaparece si se borra su carpeta.
 * En Docker monta un volumen dedicado (valo-archive).
 *
 * Flujo de llenado:
 *  - Incremental ($0 requests): cada sync del bucket archiva las partidas
 *    nuevas que trae (página 0 y páginas profundas). Lo hace riot/matches.
 *
 * Layout en disco:
 *  data/archive/
 *    {name}_{tag}/index.json         -> ArchiveIndex
 *    {name}_{tag}/{matchId}.json     -> MatchRecord (payload completo)
 */

export type BackfillMode = 'season' | 'all';
export type BackfillStop = 'empty' | 'partial' | 'maxPages' | 'seasonBoundary' | 'error' | 'skipped';

export interface ArchiveIndex {
  /** ms epoch de la última actualización del índice */
  updatedAt: number;
  total: number;
  /** match_ids archivados (sin orden garantizado; la agregación reordena) */
  ids: string[];
  oldestAt: number | null;
  newestAt: number | null;
  backfill?: { at: number; mode: BackfillMode; pages: number; added: number; stoppedBy: BackfillStop };
}

export interface ArchiveStats {
  total: number;
  oldestAt: number | null;
  newestAt: number | null;
  updatedAt: number | null;
  backfill?: ArchiveIndex['backfill'];
}

export interface MergeResult {
  added: number;
  total: number;
}

// ---------- Store en disco (externo al cache) ----------

const ARCHIVE_DIR = path.resolve(process.cwd(), env('ARCHIVE_DIR', 'data/archive'));

let dirReady = false;

function ensureDir(): boolean {
  if (dirReady) return true;
  try {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    dirReady = true;
  } catch {
    // sin disco escribible: el archivo opera solo con la capa en memoria
  }
  return dirReady;
}

// Escrituras serializadas para no pisar archivos con writes concurrentes
// (mismo patrón que la capa L2 del cache). Atómico: `.tmp` + rename para que
// un crash a mitad de escritura nunca corrompa una partida archivada.
let writeQueue = Promise.resolve();
let warnedWriteError = false;

function writeJson(file: string, value: unknown): void {
  if (!ensureDir()) return;
  writeQueue = writeQueue
    .then(() => fs.promises.mkdir(path.dirname(file), { recursive: true }))
    .then(async () => {
      const tmp = `${file}.tmp`;
      await fs.promises.writeFile(tmp, JSON.stringify(value), 'utf8');
      await fs.promises.rename(tmp, file);
    })
    .catch((e) => {
      if (!warnedWriteError) {
        warnedWriteError = true;
        console.error(`[archive] falló la escritura en ${file}: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
}

function readJson<T>(file: string): T | null {
  try {
    // Tolerante a BOM (archivos editados a mano en Windows con UTF-8 BOM fallarían en JSON.parse)
    const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function sanitizeSegment(v: string): string {
  return v.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function playerKey(nameArg: string, tagArg: string): string {
  return `${sanitizeSegment(nameArg)}_${sanitizeSegment(tagArg)}`;
}

function indexFileFor(key: string): string {
  return path.join(ARCHIVE_DIR, key, 'index.json');
}

function matchFileFor(key: string, matchId: string): string {
  // Los match_ids de Riot son UUID seguros; se sanitiza por defensa en profundidad.
  return path.join(ARCHIVE_DIR, key, `${sanitizeSegment(matchId)}.json`);
}

// Capa caliente en memoria (sin TTL: el archivo es eterno; se recalienta desde disco)
const memIndex = new Map<string, ArchiveIndex>();
const memMatches = new Map<string, MatchRecord>();

function matchMemKey(key: string, matchId: string): string {
  return `${key}:${matchId}`;
}

/** Reconstruye el índice escaneando los archivos de partidas del jugador. */
function rebuildIndex(key: string): ArchiveIndex {
  const idx: ArchiveIndex = { updatedAt: 0, total: 0, ids: [], oldestAt: null, newestAt: null };
  if (ensureDir()) {
    let files: string[] = [];
    try {
      files = fs.readdirSync(path.join(ARCHIVE_DIR, key));
    } catch {
      files = [];
    }
    for (const f of files) {
      if (!f.endsWith('.json') || f === 'index.json') continue;
      const m = readJson<MatchRecord>(path.join(ARCHIVE_DIR, key, f));
      const id = m ? matchIdOf(m) : '';
      if (!m || !id) continue;
      memMatches.set(matchMemKey(key, id), m);
      idx.ids.push(id);
      const t = matchTimestamp(m);
      if (t) {
        idx.oldestAt = idx.oldestAt == null ? t : Math.min(idx.oldestAt, t);
        idx.newestAt = idx.newestAt == null ? t : Math.max(idx.newestAt, t);
      }
    }
  }
  idx.total = idx.ids.length;
  idx.updatedAt = idx.total ? Date.now() : 0;
  memIndex.set(key, idx);
  if (idx.total) writeJson(indexFileFor(key), idx);
  return idx;
}

/** Lee el índice del jugador; si falta (primer arranque), lo reconstruye desde disco. */
export function readArchiveIndex(nameArg: string, tagArg: string): ArchiveIndex {
  const key = playerKey(nameArg, tagArg);
  const hit = memIndex.get(key);
  if (hit) return hit;
  const disk = readJson<ArchiveIndex>(indexFileFor(key));
  if (disk && Array.isArray(disk.ids)) {
    memIndex.set(key, disk);
    return disk;
  }
  return rebuildIndex(key);
}

/** Stats de cobertura del archivo de un jugador (para endpoints/leyenda). */
export function getArchiveStats(nameArg: string, tagArg: string): ArchiveStats {
  const idx = readArchiveIndex(nameArg, tagArg);
  return { total: idx.total, oldestAt: idx.oldestAt, newestAt: idx.newestAt, updatedAt: idx.updatedAt || null, backfill: idx.backfill };
}

function loadMatch(key: string, matchId: string): MatchRecord | null {
  const memKey = matchMemKey(key, matchId);
  const hit = memMatches.get(memKey);
  if (hit) return hit;
  const disk = readJson<MatchRecord>(matchFileFor(key, matchId));
  if (disk?.metadata?.match_id) {
    memMatches.set(memKey, disk);
    return disk;
  }
  return null;
}

/**
 * Mergea partidas al archivo (append-only, dedupe por match_id).
 * Las partidas incompletas se ignoran: el sync las traerá de nuevo cuando
 * estén terminadas y entonces sí se archivan (evita copias stale eternas).
 */
export function mergeIntoArchive(nameArg: string, tagArg: string, incoming: MatchRecord[]): MergeResult {
  if (!incoming.length) return { added: 0, total: readArchiveIndex(nameArg, tagArg).total };

  const key = playerKey(nameArg, tagArg);
  const idx = readArchiveIndex(nameArg, tagArg);
  const seen = new Set(idx.ids);
  let added = 0;
  let oldestAt = idx.oldestAt;
  let newestAt = idx.newestAt;
  const addedIds: string[] = [];

  for (const m of incoming) {
    const id = matchIdOf(m);
    if (!id || seen.has(id)) continue;
    if (m.metadata?.is_completed === false) continue;
    seen.add(id);
    addedIds.push(id);
    memMatches.set(matchMemKey(key, id), m);
    writeJson(matchFileFor(key, id), m);
    added += 1;
    const t = matchTimestamp(m);
    if (t) {
      oldestAt = oldestAt == null ? t : Math.min(oldestAt, t);
      newestAt = newestAt == null ? t : Math.max(newestAt, t);
    }
  }

  if (added) {
    idx.ids.push(...addedIds);
    idx.total = idx.ids.length;
    idx.oldestAt = oldestAt;
    idx.newestAt = newestAt;
    idx.updatedAt = Date.now();
    memIndex.set(key, idx);
    writeJson(indexFileFor(key), idx);
  }
  return { added, total: idx.total };
}

/** Todas las partidas archivadas de un jugador, más recientes primero. */
export function getArchiveMatches(nameArg: string, tagArg: string): MatchRecord[] {
  const key = playerKey(nameArg, tagArg);
  const idx = readArchiveIndex(nameArg, tagArg);
  const out: MatchRecord[] = [];
  for (const id of idx.ids) {
    const m = loadMatch(key, id);
    if (m) out.push(m);
  }
  return out.sort((a, b) => matchTimestamp(b) - matchTimestamp(a));
}

/** Lectura de una partida archivada (memoria, luego disco). */
export function getArchiveMatchById(nameArg: string, tagArg: string, matchId: string): MatchRecord | null {
  if (!matchId) return null;
  return loadMatch(playerKey(nameArg, tagArg), matchId);
}

