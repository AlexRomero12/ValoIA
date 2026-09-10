import fs from 'node:fs';
import path from 'node:path';
import { env } from './env';

/**
 * Cache de dos capas:
 *  - L1: memoria (lectura instantánea, por proceso)
 *  - L2: archivos JSON en disco (persiste entre reinicios del proceso/contenedor)
 *
 * API:
 *  - cached(key, ttlMs, loader, validate?) -> devuelve valor cacheado o ejecuta loader una sola vez
 *  - revalidate(key, ttlMs, loader)        -> fuerza la recarga (ignora TTL) y sobrescribe el valor
 *  - peek(key)                             -> lectura sin expirar (stale si expiró), null si no existe
 *  - cacheSet(key, value, ttlMs)           -> escritura directa
 *  - invalidatePrefix(prefix)              -> borra claves que empiecen con el prefijo
 *  - invalidateAll()
 */

interface Entry {
  expires: number;
  value: unknown;
}

const CACHE_DIR = path.resolve(process.cwd(), env('CACHE_DIR', '.cache'));

const mem = new Map<string, Entry>();

// Dedupe de cargas en vuelo: si dos requests piden la misma clave al mismo tiempo,
// el loader se ejecuta UNA vez y ambos esperan la misma promesa.
const inFlight = new Map<string, Promise<unknown>>();

let dirReady = false;

function ensureDir(): void {
  if (dirReady) return;
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    dirReady = true;
  } catch {
    // sin disco escribible: operamos solo con memoria
  }
}

/** Normaliza una clave a nombre de archivo seguro (sin ':' ni separadores). */
function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/** Hash corto y estable (FNV-1a) para desambiguar claves sanitizadas. */
function keyHash(key: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function fileFor(key: string): string {
  // Los ':' (y cualquier otro carácter raro) van a '_': en Windows los ':' en
  // nombre de archivo son inválidos/ADS y rompían la capa de disco (L2).
  // El sufijo hash evita colisiones entre claves distintas que sanitizan
  // igual (p. ej. un Riot ID con caracteres CJK → guiones). Nota: la caché
  // en disco anterior se invalida una vez (miss) tras este cambio.
  return path.join(CACHE_DIR, `${sanitizeKey(key)}_${keyHash(key)}.json`);
}

function readEntryFile(file: string): Entry | null {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as Entry;
    if (!parsed || typeof parsed.expires !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function legacyFileFor(key: string): string {
  return path.join(CACHE_DIR, `${sanitizeKey(key)}.json`);
}

function readDisk(key: string): Entry | null {
  ensureDir();
  if (!dirReady) return null;
  const direct = readEntryFile(fileFor(key));
  if (direct) return direct;
  // Compat con el formato anterior (sin sufijo hash): se adopta la entrada
  // y se reescribe con el nombre nuevo. Evita un miss masivo (y tormenta de
  // requests) al desplegar este cambio con volúmenes ya poblados.
  const legacyFile = legacyFileFor(key);
  if (legacyFile === fileFor(key)) return null;
  const legacy = readEntryFile(legacyFile);
  if (!legacy) return null;
  mem.set(key, legacy);
  writeDisk(key, legacy);
  try {
    fs.rmSync(legacyFile);
  } catch {
    /* noop */
  }
  return legacy;
}

let writeQueue = Promise.resolve();

let warnedDiskError = false;

function writeDisk(key: string, entry: Entry): void {
  ensureDir();
  if (!dirReady) return;
  // Escrituras serializadas para no pisar archivos con writes concurrentes.
  writeQueue = writeQueue
    .then(() => fs.promises.writeFile(fileFor(key), JSON.stringify(entry), 'utf8'))
    .catch((e) => {
      if (!warnedDiskError) {
        warnedDiskError = true;
        console.error(`[cache] falló la escritura en disco: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
}

export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>, validate?: (value: T) => boolean): Promise<T> {
  // L1 memoria
  const hit = mem.get(key);
  const now = Date.now();
  if (hit && hit.expires > now && (!validate || validate(hit.value as T))) return hit.value as T;

  // L2 disco
  const diskEntry = readDisk(key);
  if (diskEntry && diskEntry.expires > now && (!validate || validate(diskEntry.value as T))) {
    mem.set(key, diskEntry);
    return diskEntry.value as T;
  }

  // Loader en vuelo (dedupe)
  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;

  const job = loader()
    .then((value) => {
      const entry: Entry =
        ttlMs >= Number.MAX_SAFE_INTEGER
          ? { expires: Number.MAX_SAFE_INTEGER, value }
          : { expires: Date.now() + ttlMs, value };
      mem.set(key, entry);
      writeDisk(key, entry);
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, job);
  return job as Promise<T>;
}

export function cacheSet(key: string, value: unknown, ttlMs: number): void {
  const entry: Entry = { expires: Date.now() + ttlMs, value };
  mem.set(key, entry);
  writeDisk(key, entry);
}
/** Lectura sin respetar la expiración (stale si venció); null si nunca existió. */
export function peek<T>(key: string): T | null {
  const hit = mem.get(key);
  if (hit) return hit.value as T;
  const disk = readDisk(key);
  return disk ? (disk.value as T) : null;
}

/**
 * Última escritura conocida de una clave en disco (mtime), o null si no hay
 * archivo. Sirve como señal de frescura por fuente (p. ej. mmr-history vs
 * bucket tienen TTLs distintos y un solo syncedAt mentía).
 */
export function cacheUpdatedAt(key: string): number | null {
  ensureDir();
  if (!dirReady) return null;
  try {
    return fs.statSync(fileFor(key)).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Recarga forzada de una clave ignorando el TTL (patrón SWR server-side).
 * Comparte dedupe con cached(): si hay una carga/recarga en vuelo, espera esa.
 */
export async function revalidate<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;

  const job = loader()
    .then((value) => {
      const entry: Entry =
        ttlMs >= Number.MAX_SAFE_INTEGER
          ? { expires: Number.MAX_SAFE_INTEGER, value }
          : { expires: Date.now() + ttlMs, value };
      mem.set(key, entry);
      writeDisk(key, entry);
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, job);
  return job as Promise<T>;
}

export function findCachedValues<T>(prefix: string): T[] {
  const now = Date.now();
  const out: T[] = [];
  for (const [k, e] of mem) {
    if (k.startsWith(prefix) && e.expires > now) out.push(e.value as T);
  }
  ensureDir();
  if (!dirReady) return out;
  const safePrefix = sanitizeKey(prefix);
  let files: string[] = [];
  try {
    files = fs.readdirSync(CACHE_DIR);
  } catch {
    return out;
  }
  const seen = new Set([...mem.keys()]);
  for (const f of files) {
    if (!f.endsWith('.json') || !f.startsWith(safePrefix)) continue;
    const keyGuess = f.slice(0, -5);
    if ([...seen].some((k) => fileFor(k) === path.join(CACHE_DIR, f) || k === keyGuess)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), 'utf8')) as Entry;
      if (parsed.expires > now) out.push(parsed.value as T);
    } catch {
      /* noop */
    }
  }
  return out;
}

function dropEverywhere(key: string): void {
  mem.delete(key);
  inFlight.delete(key);
  ensureDir();
  if (!dirReady) return;
  try {
    fs.rmSync(fileFor(key), { force: true });
  } catch {
    /* noop */
  }
}

export function invalidatePrefix(prefix: string): void {
  for (const key of [...mem.keys()]) {
    if (key.startsWith(prefix)) dropEverywhere(key);
  }
  // También en disco (los archivos llevan el key sanitizado)
  ensureDir();
  if (!dirReady) return;
  let files: string[];
  try {
    files = fs.readdirSync(CACHE_DIR);
  } catch {
    return;
  }
  const safePrefix = sanitizeKey(prefix);
  for (const f of files) {
    if (f.endsWith('.json') && f.startsWith(safePrefix)) {
      try {
        fs.rmSync(path.join(CACHE_DIR, f), { force: true });
      } catch {
        /* noop */
      }
    }
  }
}

export function invalidateAll(): void {
  mem.clear();
  inFlight.clear();
  ensureDir();
  if (!dirReady) return;
  try {
    for (const f of fs.readdirSync(CACHE_DIR)) {
      if (f.endsWith('.json')) fs.rmSync(path.join(CACHE_DIR, f), { force: true });
    }
  } catch {
    /* noop */
  }
}
