import fs from 'node:fs';
import path from 'node:path';
import { env } from './env';
import { fetchMatchesPage, henrikMatchId, henrikMatchTimestamp, HENRIK_CONFIG, PAGE_SIZE, type HenrikMatch } from './henrik';

/**
 * Archivo acumulativo de partidas por jugador (modelo tracker.gg).
 *
 * El bucket de partidas (`henrik:matches:v2`) es una ventana fresca de las
 * últimas 40: cuando el jugador juega más, las viejas salen de la API y con
 * ellas se perderían KPIs de temporada, WR por agente/mapa, etc. Este módulo
 * es la contraparte persistente: TODA partida competitiva descargada se guarda
 * para siempre (una partida = un archivo JSON) junto con un índice compacto
 * por jugador.
 *
 * IMPORTANTE — durabilidad: este store es EXTERNO al cache L1/L2 (lib/cache.ts).
 * Vive en su propio directorio (`data/archive/`, configurable con ARCHIVE_DIR)
 * y NO se ve afectado por invalidateAll(), por el borrado manual de `.cache/`
 * ni por rotaciones/rebuilds del cache. Solo desaparece si se borra su carpeta.
 * En Docker monta un volumen dedicado (valo-archive).
 *
 * Flujo de llenado:
 *  - Incremental ($0 requests): cada sync del bucket archiva las partidas
 *    nuevas que trae (página 0 y páginas profundas). Lo hace syncMatchesBucket.
 *  - Backfill profundo (una vez): `backfillArchive` pagina más allá del bucket
 *    hasta el fondo del historial o el borde de la temporada actual.
 *
 * Layout en disco:
 *  data/archive/
 *    {name}_{tag}/index.json         -> ArchiveIndex
 *    {name}_{tag}/{matchId}.json     -> HenrikMatch (payload completo)
 */

export const ARCHIVE_VERSION = 'v1';

const BACKFILL_DEFAULT_PAGES = 40; // ~400 partidas competitivas por pasada
const BACKFILL_MAX_PAGES = 150; // techo duro por ejecución (~25 min con throttle)

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

export interface BackfillOptions {
  /** 'season' (default) = hasta cubrir la temporada actual; 'all' = hasta el fondo */
  mode?: BackfillMode;
  /** páginas de 10 partidas; default 40, tope 150 */
  maxPages?: number;
  /** re-ejecutar aunque ya exista un backfill cubierto */
  force?: boolean;
}

export interface BackfillResult {
  name: string;
  tag: string;
  pages: number;
  /** partidas descargadas (incluye duplicados ya archivados) */
  fetched: number;
  /** partidas realmente nuevas en el archivo */
  added: number;
  total: number;
  oldestAt: number | null;
  newestAt: number | null;
  stoppedBy: BackfillStop;
  error?: string;
  durationMs: number;
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
// (mismo patrón que la capa L2 del cache).
let writeQueue = Promise.resolve();
let warnedWriteError = false;

function writeJson(file: string, value: unknown): void {
  if (!ensureDir()) return;
  writeQueue = writeQueue
    .then(() => fs.promises.mkdir(path.dirname(file), { recursive: true }))
    .then(() => fs.promises.writeFile(file, JSON.stringify(value), 'utf8'))
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
const memMatches = new Map<string, HenrikMatch>();

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
      const m = readJson<HenrikMatch>(path.join(ARCHIVE_DIR, key, f));
      const id = m ? henrikMatchId(m) : '';
      if (!m || !id) continue;
      memMatches.set(matchMemKey(key, id), m);
      idx.ids.push(id);
      const t = henrikMatchTimestamp(m);
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

function loadMatch(key: string, matchId: string): HenrikMatch | null {
  const memKey = matchMemKey(key, matchId);
  const hit = memMatches.get(memKey);
  if (hit) return hit;
  const disk = readJson<HenrikMatch>(matchFileFor(key, matchId));
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
export function mergeIntoArchive(nameArg: string, tagArg: string, incoming: HenrikMatch[]): MergeResult {
  if (!incoming.length) return { added: 0, total: readArchiveIndex(nameArg, tagArg).total };

  const key = playerKey(nameArg, tagArg);
  const idx = readArchiveIndex(nameArg, tagArg);
  const seen = new Set(idx.ids);
  let added = 0;
  let oldestAt = idx.oldestAt;
  let newestAt = idx.newestAt;
  const addedIds: string[] = [];

  for (const m of incoming) {
    const id = henrikMatchId(m);
    if (!id || seen.has(id)) continue;
    if (m.metadata?.is_completed === false) continue;
    seen.add(id);
    addedIds.push(id);
    memMatches.set(matchMemKey(key, id), m);
    writeJson(matchFileFor(key, id), m);
    added += 1;
    const t = henrikMatchTimestamp(m);
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
export function getArchiveMatches(nameArg: string, tagArg: string): HenrikMatch[] {
  const key = playerKey(nameArg, tagArg);
  const idx = readArchiveIndex(nameArg, tagArg);
  const out: HenrikMatch[] = [];
  for (const id of idx.ids) {
    const m = loadMatch(key, id);
    if (m) out.push(m);
  }
  return out.sort((a, b) => henrikMatchTimestamp(b) - henrikMatchTimestamp(a));
}

/** Lectura de una partida archivada (memoria, luego disco). */
export function getArchiveMatchById(nameArg: string, tagArg: string, matchId: string): HenrikMatch | null {
  if (!matchId) return null;
  return loadMatch(playerKey(nameArg, tagArg), matchId);
}

/**
 * Backfill profundo: pagina el historial competitivo más allá del bucket
 * (hasta BACKFILL_MAX_PAGES) archivando todo lo que encuentre. El progreso
 * persiste página a página, así que un corte por rate limit no pierde trabajo.
 *
 * Costo con key Basic (throttle propio ~24 req/min): ~1.8 s por página.
 * Una segunda ejecución con la misma profundidad se salta si la anterior
 * terminó bien (salvo force=true).
 */
export async function backfillArchive(nameArg: string, tagArg: string, opts: BackfillOptions = {}): Promise<BackfillResult> {
  const startedAt = Date.now();
  const mode: BackfillMode = opts.mode === 'all' ? 'all' : 'season';
  const maxPages = Math.max(1, Math.min(Math.floor(opts.maxPages ?? BACKFILL_DEFAULT_PAGES), BACKFILL_MAX_PAGES));

  const idx0 = readArchiveIndex(nameArg, tagArg);
  const prev = idx0.backfill;
  if (!opts.force && prev && prev.mode === mode && prev.pages >= maxPages && prev.stoppedBy !== 'error') {
    return {
      name: nameArg,
      tag: tagArg,
      pages: prev.pages,
      fetched: 0,
      added: 0,
      total: idx0.total,
      oldestAt: idx0.oldestAt,
      newestAt: idx0.newestAt,
      stoppedBy: 'skipped',
      durationMs: Date.now() - startedAt,
    };
  }

  const name = encodeURIComponent(nameArg);
  const tag = encodeURIComponent(tagArg);
  const affinity = HENRIK_CONFIG.region();
  const platform = HENRIK_CONFIG.platform();
  let currentSeason: string | null | undefined = undefined; // undefined = aún sin dato
  let pages = 0;
  let fetched = 0;
  let added = 0;
  let oldestAt = idx0.oldestAt;
  let newestAt = idx0.newestAt;
  let stoppedBy: BackfillStop = 'maxPages';
  let errorMsg: string | undefined;

  for (let p = 0; p < maxPages; p++) {
    let batch: HenrikMatch[];
    try {
      batch = await fetchMatchesPage(affinity, platform, name, tag, 'competitive', p * PAGE_SIZE, PAGE_SIZE);
    } catch (err) {
      stoppedBy = 'error';
      errorMsg = err instanceof Error ? err.message : String(err);
      break;
    }
    pages += 1;
    fetched += batch.length;
    added += mergeIntoArchive(nameArg, tagArg, batch).added;
    for (const m of batch) {
      const t = henrikMatchTimestamp(m);
      if (t) {
        oldestAt = oldestAt == null ? t : Math.min(oldestAt, t);
        newestAt = newestAt == null ? t : Math.max(newestAt, t);
      }
    }
    // Menos de lo pedido => no hay más historial en la API.
    if (batch.length < PAGE_SIZE) {
      stoppedBy = 'partial';
      break;
    }
    if (currentSeason === undefined) currentSeason = batch[0]?.metadata?.season?.short ?? null;
    // Una página completa fuera de la temporada actual => la temporada quedó cubierta.
    if (mode === 'season' && currentSeason && batch.every((m) => (m.metadata?.season?.short ?? null) !== currentSeason)) {
      stoppedBy = 'seasonBoundary';
      break;
    }
  }

  const idx = readArchiveIndex(nameArg, tagArg);
  idx.backfill = { at: Date.now(), mode, pages, added, stoppedBy };
  idx.updatedAt = Date.now();
  memIndex.set(playerKey(nameArg, tagArg), idx);
  writeJson(indexFileFor(playerKey(nameArg, tagArg)), idx);

  return {
    name: nameArg,
    tag: tagArg,
    pages,
    fetched,
    added,
    total: idx.total,
    oldestAt,
    newestAt,
    stoppedBy,
    error: errorMsg,
    durationMs: Date.now() - startedAt,
  };
}
