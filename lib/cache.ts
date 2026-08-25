import fs from 'node:fs';
import path from 'node:path';
import { env } from './env';

/**
 * Cache de dos capas:
 *  - L1: memoria (lectura instantánea, por proceso)
 *  - L2: archivos JSON en disco (persiste entre reinicios del proceso/contenedor)
 *
 * API:
 *  - cached(key, ttlMs, loader)  -> devuelve valor cacheado o ejecuta loader una sola vez
 *  - cacheSet(key, value, ttlMs) -> escritura directa
 *  - invalidatePrefix(prefix)    -> borra claves que empiecen con el prefijo
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

function fileFor(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9:_-]/g, '_');
  return path.join(CACHE_DIR, `${safe}.json`);
}

function readDisk(key: string): Entry | null {
  ensureDir();
  if (!dirReady) return null;
  try {
    const raw = fs.readFileSync(fileFor(key), 'utf8');
    const parsed = JSON.parse(raw) as Entry;
    if (!parsed || typeof parsed.expires !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

let writeQueue = Promise.resolve();

function writeDisk(key: string, entry: Entry): void {
  ensureDir();
  if (!dirReady) return;
  // Escrituras serializadas para no pisar archivos con writes concurrentes.
  writeQueue = writeQueue
    .then(() => fs.promises.writeFile(fileFor(key), JSON.stringify(entry), 'utf8'))
    .catch(() => {
      /* disco lleno/permisos: ignoramos, la memoria sigue válida */
    });
}

export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  // L1 memoria
  const hit = mem.get(key);
  const now = Date.now();
  if (hit && hit.expires > now) return hit.value as T;

  // L2 disco
  const diskEntry = readDisk(key);
  if (diskEntry && diskEntry.expires > now) {
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

export function findCachedValues<T>(prefix: string): T[] {
  const now = Date.now();
  const out: T[] = [];
  for (const [k, e] of mem) {
    if (k.startsWith(prefix) && e.expires > now) out.push(e.value as T);
  }
  ensureDir();
  if (!dirReady) return out;
  const safePrefix = prefix.replace(/[^a-zA-Z0-9:_-]/g, '_');
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
  const safePrefix = prefix.replace(/[^a-zA-Z0-9:_-]/g, '_');
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
