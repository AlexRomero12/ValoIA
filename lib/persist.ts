import fs from 'node:fs';
import path from 'node:path';
import { env } from './env';

/**
 * Datos persistentes de la aplicación (favoritas, suscripciones push, tokens RSO…).
 *
 * IMPORTANTE — durabilidad: este store es EXTERNO al cache L1/L2 (lib/cache.ts).
 * Vive en su propio directorio (`data/`, configurable con DATA_DIR) y NO se ve
 * afectado por invalidateAll() ni por el borrado manual de `.cache/`. En Docker
 * monta un volumen dedicado (valo-data).
 */

const DATA_DIR = path.resolve(process.cwd(), env('DATA_DIR', 'data'));

function dataPath(file: string): string {
  return path.join(DATA_DIR, file);
}

export function readData<T>(file: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(dataPath(file), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

let writeQueue = Promise.resolve();

/** Escrituras serializadas para no pisar archivos con writes concurrentes. */
export function writeData(file: string, value: unknown): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {
    /* noop */
  }
  writeQueue = writeQueue
    .then(() => fs.promises.writeFile(dataPath(file), JSON.stringify(value, null, 2), 'utf8'))
    .catch((e) => {
      console.error(`[persist] falló la escritura de ${file}: ${e instanceof Error ? e.message : String(e)}`);
    });
}