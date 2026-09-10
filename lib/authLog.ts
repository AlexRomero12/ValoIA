import { readData, writeDataSync } from './persist';

/**
 * Registro de eventos de autenticación/administración (últimos 500).
 * Persiste en `data/auth-log.json`; visible para el admin en el panel.
 */

export type AuthEventType =
  | 'login_ok'
  | 'login_fail'
  | 'login_blocked'
  | 'logout'
  | 'user_create'
  | 'user_delete'
  | 'password_change'
  | 'sessions_revoke'
  | 'request_access'
  | 'request_approve'
  | 'request_reject';

export interface AuthEvent {
  ts: number;
  type: AuthEventType;
  user?: string;
  ip?: string;
  detail?: string;
}

interface AuthLogFile {
  version: number;
  events: AuthEvent[];
}

const AUTH_LOG_FILE = 'auth-log.json';
const MAX_EVENTS = 500;

function readAll(): AuthEvent[] {
  const file = readData<AuthLogFile>(AUTH_LOG_FILE, { version: 1, events: [] });
  return (Array.isArray(file?.events) ? file.events : []).filter((e) => e && typeof e.ts === 'number');
}

export function logAuth(type: AuthEventType, data: { user?: string; ip?: string; detail?: string } = {}): void {
  // Read-modify-write síncrono: dos eventos seguidos (p. ej. aprobar + crear
  // usuario) no deben pisarse con la cola async.
  const events = [...readAll(), { ts: Date.now(), type, ...data, detail: data.detail?.slice(0, 200) }].slice(-MAX_EVENTS);
  writeDataSync(AUTH_LOG_FILE, { version: 1, events });
}

/** Últimos eventos, más recientes primero. */
export function listAuthLog(limit = 100): AuthEvent[] {
  const n = Math.max(1, Math.min(200, Math.floor(limit)));
  return [...readAll()].sort((a, b) => b.ts - a.ts).slice(0, n);
}
