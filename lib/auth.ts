import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readData, writeDataSync } from './persist';
import { authConfigured, signSession, SESSION_COOKIE, SESSION_MAX_AGE, usingDevSecret, verifySession, type SessionPayload } from './authToken';
import { createSession, getSession, revokeUserSessions, touchSession } from './sessions';
import { clientIp } from './clientIp';
import type { NextRequest, NextResponse } from 'next/server';

/**
 * Usuarios y sesiones (server-only).
 *
 * Durabilidad: `data/users.json` (volumen Docker `valo-data`), externo al
 * cache, con escrituras atómicas de `lib/persist.ts`. Las contraseñas se
 * guardan con scrypt (sal por usuario) y nunca viajan al cliente.
 *
 * Las sesiones son tokens firmados con un `sid` que vive en `lib/sessions.ts`:
 * así se pueden revocar (cambio de contraseña, borrar usuario, cerrar remoto).
 */

export interface UserRecord {
  username: string;
  hash: string;
  createdAt: number;
  updatedAt: number;
  /** El admin ve todos los perfiles, gestiona usuarios y la tienda. */
  admin?: boolean;
  /** Debe cambiar la contraseña al entrar (altas con temporal/reset). */
  mustChangePassword?: boolean;
  /** IP con la que se creó el usuario (visible para el admin). */
  createdIp?: string;
}

export type PublicUser = Pick<UserRecord, 'username' | 'createdAt' | 'updatedAt' | 'admin' | 'mustChangePassword' | 'createdIp'>;

interface UsersFile {
  version: number;
  users: UserRecord[];
}

const USERS_FILE = 'users.json';
const USERNAME_RE = /^[a-zA-Z0-9._-]{2,32}$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;

export { SESSION_COOKIE, SESSION_MAX_AGE, authConfigured };

if (usingDevSecret()) {
  console.warn('[auth] AUTH_SECRET no configurado: usando el secreto de DESARROLLO (no apto para producción)');
}

function readUsers(): UserRecord[] {
  const file = readData<UsersFile>(USERS_FILE, { version: 1, users: [] });
  const users = Array.isArray(file?.users) ? file.users : [];
  // Migración: si hay usuarios pero ninguno es admin (archivo previo al flag),
  // el más antiguo pasa a serlo para no dejar la app sin administrador.
  if (users.length > 0 && !users.some((u) => u.admin)) {
    const oldest = [...users].sort((a, b) => a.createdAt - b.createdAt)[0];
    const next = users.map((u) => (u.username === oldest.username ? { ...u, admin: true } : u));
    writeDataSync(USERS_FILE, { version: 1, users: next });
    return next;
  }
  return users;
}

function writeUsers(users: UserRecord[]): void {
  // Síncrono: evitar carreras read-after-write (alta + log, resets seguidos).
  writeDataSync(USERS_FILE, { version: 1, users });
}

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(raw: string): string | null {
  const username = normalizeUsername(raw);
  if (!USERNAME_RE.test(username)) return 'El usuario debe tener 2-32 caracteres (letras, números, . _ -)';
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD) return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`;
  if (password.length > MAX_PASSWORD) return `La contraseña no puede pasar de ${MAX_PASSWORD} caracteres`;
  return null;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString('base64url')}:${hash.toString('base64url')}`;
}

function checkPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  try {
    const salt = Buffer.from(parts[1], 'base64url');
    const expected = Buffer.from(parts[2], 'base64url');
    const hash = scryptSync(password, salt, expected.length);
    return hash.length === expected.length && timingSafeEqual(hash, expected);
  } catch {
    return false;
  }
}

/** Hash real (mismo costo/ longitud) para el camino de usuario inexistente. */
let dummyHash: string | null = null;
function getDummyHash(): string {
  if (!dummyHash) dummyHash = hashPassword('valoia-timing-filler-password');
  return dummyHash;
}

function toPublicUsers(users: UserRecord[]): PublicUser[] {
  return users
    .map(({ username, createdAt, updatedAt, admin, mustChangePassword, createdIp }) => ({
      username,
      createdAt,
      updatedAt,
      admin: admin === true,
      mustChangePassword: mustChangePassword === true,
      createdIp,
    }))
    .sort((a, b) => Number(b.admin) - Number(a.admin) || a.username.localeCompare(b.username));
}

export function listUsers(): PublicUser[] {
  return toPublicUsers(readUsers());
}

export function userCount(): number {
  return readUsers().length;
}

/** Nombre del usuario admin (el más antiguo con flag). */
export function adminUsername(): string | null {
  const users = readUsers();
  const admin = users.filter((u) => u.admin).sort((a, b) => a.createdAt - b.createdAt)[0];
  return admin?.username ?? users[0]?.username ?? null;
}

export function isAdmin(username: string): boolean {
  const user = readUsers().find((u) => u.username === normalizeUsername(username));
  return user?.admin === true;
}

export function mustChangePassword(username: string): boolean {
  const user = readUsers().find((u) => u.username === normalizeUsername(username));
  return user?.mustChangePassword === true;
}

function setMustChange(username: string, value: boolean): void {
  const users = readUsers();
  writeUsers(users.map((u) => (u.username === normalizeUsername(username) ? { ...u, mustChangePassword: value } : u)));
}

/**
 * Siembra el primer usuario desde `AUTH_USER`/`AUTH_PASSWORD` cuando no hay
 * ninguno. Idempotente: no pisa usuarios existentes.
 */
export function ensureSeedUser(): void {
  if (readUsers().length > 0) return;
  const user = process.env.AUTH_USER?.trim();
  const pass = process.env.AUTH_PASSWORD ?? '';
  if (!user || !pass) return;
  const err = validateUsername(user) ?? validatePassword(pass);
  if (err) {
    console.error(`[auth] no se pudo sembrar el usuario inicial: ${err}`);
    return;
  }
  const now = Date.now();
  writeUsers([
    { username: normalizeUsername(user), hash: hashPassword(pass), createdAt: now, updatedAt: now, admin: true },
  ]);
}

export type UserResult = { ok: true; users: PublicUser[] } | { ok: false; error: string };

export function createUser(
  rawUsername: string,
  password: string,
  opts: { createdIp?: string; mustChangePassword?: boolean } = {},
): UserResult {
  const username = normalizeUsername(rawUsername);
  const err = validateUsername(username) ?? validatePassword(password);
  if (err) return { ok: false, error: err };
  const users = readUsers();
  if (users.some((u) => u.username === username)) return { ok: false, error: 'Ese usuario ya existe' };
  const now = Date.now();
  const next: UserRecord[] = [
    ...users,
    {
      username,
      hash: hashPassword(password),
      createdAt: now,
      updatedAt: now,
      createdIp: opts.createdIp,
      mustChangePassword: opts.mustChangePassword === true,
    },
  ];
  writeUsers(next);
  return { ok: true, users: toPublicUsers(next) };
}

/** Cambia la contraseña; `mustChange` controla el cambio forzado al entrar. */
export function changePassword(rawUsername: string, password: string, opts: { mustChange?: boolean } = {}): UserResult {
  const username = normalizeUsername(rawUsername);
  const err = validatePassword(password);
  if (err) return { ok: false, error: err };
  const users = readUsers();
  const idx = users.findIndex((u) => u.username === username);
  if (idx < 0) return { ok: false, error: 'Usuario no encontrado' };
  const next = users.map((u, i) =>
    i === idx ? { ...u, hash: hashPassword(password), updatedAt: Date.now(), mustChangePassword: opts.mustChange === true } : u,
  );
  writeUsers(next);
  return { ok: true, users: toPublicUsers(next) };
}

export function deleteUser(rawUsername: string, requester: string): UserResult {
  const username = normalizeUsername(rawUsername);
  if (username === normalizeUsername(requester)) return { ok: false, error: 'No puedes borrar tu propio usuario' };
  const users = readUsers();
  if (users.length <= 1) return { ok: false, error: 'No puedes borrar el último usuario' };
  const next = users.filter((u) => u.username !== username);
  if (next.length === users.length) return { ok: false, error: 'Usuario no encontrado' };
  writeUsers(next);
  revokeUserSessions(username);
  return { ok: true, users: toPublicUsers(next) };
}

/** Verifica credenciales (scrypt + comparación en tiempo constante). */
export function verifyCredentials(rawUsername: string, password: string): boolean {
  const username = normalizeUsername(rawUsername);
  const user = readUsers().find((u) => u.username === username);
  if (!user) {
    // Igual costo que un usuario real para no filtrar existencia por timing.
    checkPassword(password, getDummyHash());
    return false;
  }
  return checkPassword(password, user.hash);
}

// ---------- Sesiones ----------

/** Sesión válida de la request (firma + registry + no expirada). */
export function sessionFromRequest(req: NextRequest): SessionPayload | null {
  const payload = verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!payload) return null;
  const record = getSession(payload.sid);
  if (!record || record.user !== payload.u) return null;
  touchSession(payload.sid);
  return payload;
}

/** Para el proxy: sesión válida + si el usuario debe cambiar contraseña. */
export function sessionGate(req: NextRequest): { session: SessionPayload; mustChange: boolean } | null {
  const session = sessionFromRequest(req);
  if (!session) return null;
  return { session, mustChange: mustChangePassword(session.u) };
}

/** Visor de la request (usuario + admin) para las reglas de acceso a perfiles. */
export function viewerFromRequest(req: NextRequest): { username: string; admin: boolean } | null {
  const session = sessionFromRequest(req);
  if (!session) return null;
  return { username: session.u, admin: isAdmin(session.u) };
}

export function isHttps(req: NextRequest): boolean {
  const proto = req.headers.get('x-forwarded-proto');
  if (proto) return proto.split(',')[0]?.trim() === 'https';
  return req.nextUrl.protocol === 'https:';
}

/** Crea el registry + token y setea la cookie. Devuelve el `sid` o null. */
export function startSession(res: NextResponse, username: string, req: NextRequest): string | null {
  const record = createSession(username, clientIp(req), req.headers.get('user-agent') ?? '', SESSION_MAX_AGE * 1000);
  const token = signSession(username, record.id);
  if (!token) return null;
  res.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps(req),
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return record.id;
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set({ name: SESSION_COOKIE, value: '', httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
}

export { setMustChange };
