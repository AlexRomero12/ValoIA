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

/**
 * Escrituras serializadas para no pisar archivos con writes concurrentes.
 * Atómico: se escribe a un `.tmp` y se renombra, así un crash a mitad de
 * escritura nunca deja el JSON principal corrupto (pérdida irreversible en
 * favoritas/comentarios/historial).
 */
export function writeData(file: string, value: unknown): void {
  try {
    fs.mkdirSync(path.dirname(dataPath(file)), { recursive: true });
  } catch {
    /* noop */
  }
  writeQueue = writeQueue
    .then(async () => {
      const target = dataPath(file);
      const tmp = `${target}.tmp`;
      await fs.promises.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
      await fs.promises.rename(tmp, target);
    })
    .catch((e) => {
      console.error(`[persist] falló la escritura de ${file}: ${e instanceof Error ? e.message : String(e)}`);
    });
}

/**
 * Escritura atómica síncrona. Para archivos críticos que se escriben y se
 * leen al instante desde otro bundle/módulo (p. ej. el registry de sesiones,
 * que el proxy lee en su propio contexto): la cola async daría lecturas
 * rancias justo después del login.
 */
export function writeDataSync(file: string, value: unknown): void {
  try {
    fs.mkdirSync(path.dirname(dataPath(file)), { recursive: true });
    const target = dataPath(file);
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(tmp, target);
  } catch (e) {
    console.error(`[persist] falló la escritura síncrona de ${file}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Borra un archivo de datos (no falla si no existe). Para migraciones. */
export function deleteData(file: string): void {
  try {
    fs.unlinkSync(dataPath(file));
  } catch {
    /* noop */
  }
}