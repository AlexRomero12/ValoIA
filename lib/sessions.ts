import { randomBytes } from 'node:crypto';
import { readData, writeDataSync } from './persist';

/**
 * Registro de sesiones activas (server-only).
 *
 * Los tokens son stateless (HMAC), pero aquí vive el `sid`: permite revocar
 * sesiones (cambio de contraseña, borrar usuario, "cerrar dispositivos") y
 * aplicar topes por usuario/IP.
 *
 * Durabilidad: `data/sessions.json` (volumen `valo-data`), con escrituras
 * atómicas de `lib/persist.ts`. Caché en memoria de 5 s para que el proxy no
 * lea disco en cada request; las escrituras actualizan la caché al instante.
 */

export interface SessionRecord {
  id: string;
  user: string;
  ip: string;
  ua: string;
  createdAt: number;
  lastSeenAt: number;
  exp: number;
}

interface SessionsFile {
  version: number;
  sessions: SessionRecord[];
}

const SESSIONS_FILE = 'sessions.json';
const CACHE_MS = 5_000;
const TOUCH_MS = 5 * 60 * 1000;

function intEnv(name: string, fallback: number): number {
  const v = Number(process.env[name] ?? '');
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) : fallback;
}

const MAX_PER_USER = intEnv('SESSION_MAX_PER_USER', 5);
const MAX_PER_IP = intEnv('SESSION_MAX_PER_IP', 3);

let cache: { at: number; sessions: SessionRecord[] } | null = null;

function alive(s: SessionRecord, now = Date.now()): boolean {
  return typeof s.exp === 'number' && s.exp > now;
}

function readAll(): SessionRecord[] {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.sessions;
  const file = readData<SessionsFile>(SESSIONS_FILE, { version: 1, sessions: [] });
  const sessions = (Array.isArray(file?.sessions) ? file.sessions : []).filter((s) => s && typeof s.id === 'string');
  cache = { at: Date.now(), sessions };
  return sessions;
}

function writeAll(sessions: SessionRecord[]): void {
  cache = { at: Date.now(), sessions };
  // Síncrono a propósito: el proxy vive en otro bundle y debe ver la sesión
  // recién creada en el request inmediatamente siguiente al login.
  writeDataSync(SESSIONS_FILE, { version: 1, sessions });
}

/** Limpia expiradas (barato; se llama en lecturas públicas). */
export function pruneSessions(now = Date.now()): void {
  const all = readAll();
  const next = all.filter((s) => alive(s, now));
  if (next.length !== all.length) writeAll(next);
}

export function getSession(id: string): SessionRecord | null {
  const cached = readAll().find((s) => s.id === id);
  if (cached) return alive(cached) ? cached : null;
  // Miss: re-lee del disco una vez (otro módulo pudo crear la sesión y la
  // caché de este bundle aún no lo sabe).
  const file = readData<SessionsFile>(SESSIONS_FILE, { version: 1, sessions: [] });
  const sessions = (Array.isArray(file?.sessions) ? file.sessions : []).filter((s) => s && typeof s.id === 'string');
  cache = { at: Date.now(), sessions };
  const fresh = sessions.find((s) => s.id === id);
  return fresh && alive(fresh) ? fresh : null;
}

/**
 * Crea una sesión aplicando topes: al exceder el máximo por usuario o por IP
 * se revoca la más antigua (en vez de rechazar el login).
 */
export function createSession(user: string, ip: string, ua: string, ttlMs: number): SessionRecord {
  const now = Date.now();
  let all = readAll().filter((s) => alive(s, now));
  const record: SessionRecord = {
    id: randomBytes(24).toString('base64url'),
    user,
    ip,
    ua: ua.slice(0, 300),
    createdAt: now,
    lastSeenAt: now,
    exp: now + ttlMs,
  };

  const drop = (list: SessionRecord[]) => {
    const ids = new Set(list.map((s) => s.id));
    all = all.filter((s) => !ids.has(s.id));
  };

  const mine = all.filter((s) => s.user === user).sort((a, b) => a.createdAt - b.createdAt);
  while (mine.length >= MAX_PER_USER) {
    const oldest = mine.shift();
    if (!oldest) break;
    drop([oldest]);
  }

  // 'local' = sin proxy confiable (dev): no se aplica el tope por IP.
  if (ip !== 'local') {
    const sameIp = all.filter((s) => s.ip === ip).sort((a, b) => a.createdAt - b.createdAt);
    while (sameIp.length >= MAX_PER_IP) {
      const oldest = sameIp.shift();
      if (!oldest) break;
      drop([oldest]);
    }
  }

  all.push(record);
  writeAll(all);
  return record;
}

/** Actualiza lastSeenAt con throttling (evita escribir en cada request). */
export function touchSession(id: string): void {
  const now = Date.now();
  const all = readAll();
  const session = all.find((s) => s.id === id);
  if (!session || now - session.lastSeenAt < TOUCH_MS) return;
  writeAll(all.map((s) => (s.id === id ? { ...s, lastSeenAt: now } : s)));
}

export function revokeSession(id: string, user?: string): boolean {
  const all = readAll();
  const target = all.find((s) => s.id === id && (!user || s.user === user));
  if (!target) return false;
  writeAll(all.filter((s) => s.id !== id));
  return true;
}

/** Revoca todas las sesiones de un usuario (menos `exceptId`, para el cambio propio). */
export function revokeUserSessions(user: string, exceptId?: string): number {
  const all = readAll();
  const doomed = all.filter((s) => s.user === user && s.id !== exceptId);
  if (doomed.length === 0) return 0;
  const ids = new Set(doomed.map((s) => s.id));
  writeAll(all.filter((s) => !ids.has(s.id)));
  return doomed.length;
}

/** Sesiones activas (de un usuario o de todos, para el panel admin). */
export function listSessions(user?: string): SessionRecord[] {
  pruneSessions();
  const all = readAll().filter((s) => alive(s));
  const filtered = user ? all.filter((s) => s.user === user) : all;
  return [...filtered].sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}
