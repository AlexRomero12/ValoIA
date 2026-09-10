import { randomBytes } from 'node:crypto';
import { readData, writeDataSync } from './persist';

/**
 * Solicitudes de acceso (server-only).
 *
 * Un usuario sin cuenta pide acceso desde `/login`; el admin aprueba (crea el
 * usuario con contraseña temporal + cambio forzado) o rechaza desde el panel.
 * Persiste en `data/access-requests.json` (volumen `valo-data`).
 */

export interface AccessRequest {
  id: string;
  username: string;
  message?: string;
  ip: string;
  ua?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  decidedAt?: number;
  decidedBy?: string;
}

interface RequestsFile {
  version: number;
  requests: AccessRequest[];
}

const REQUESTS_FILE = 'access-requests.json';
const MAX_KEEP = 200;
export const MAX_MESSAGE = 300;

function readAll(): AccessRequest[] {
  const file = readData<RequestsFile>(REQUESTS_FILE, { version: 1, requests: [] });
  return (Array.isArray(file?.requests) ? file.requests : []).filter((r) => r && typeof r.id === 'string');
}

function writeAll(requests: AccessRequest[]): void {
  // Se conservan las pendientes y las últimas decididas.
  const pending = requests.filter((r) => r.status === 'pending');
  const decided = requests
    .filter((r) => r.status !== 'pending')
    .sort((a, b) => (b.decidedAt ?? b.createdAt) - (a.decidedAt ?? a.createdAt));
  writeDataSync(REQUESTS_FILE, { version: 1, requests: [...decided.slice(0, MAX_KEEP - pending.length), ...pending] });
}

/** Pendientes primero; después las decididas más recientes. */
export function listRequests(): AccessRequest[] {
  const all = readAll();
  const pending = all.filter((r) => r.status === 'pending').sort((a, b) => b.createdAt - a.createdAt);
  const decided = all
    .filter((r) => r.status !== 'pending')
    .sort((a, b) => (b.decidedAt ?? b.createdAt) - (a.decidedAt ?? a.createdAt))
    .slice(0, 50);
  return [...pending, ...decided];
}

export function pendingCount(): number {
  return readAll().filter((r) => r.status === 'pending').length;
}

/** Crea la solicitud. Si ya hay una pendiente del mismo usuario, no duplica. */
export function createRequest(username: string, message: string, ip: string, ua: string): AccessRequest {
  const all = readAll();
  const existing = all.find((r) => r.status === 'pending' && r.username === username);
  if (existing) return existing;
  const request: AccessRequest = {
    id: randomBytes(12).toString('base64url'),
    username,
    message: message.slice(0, MAX_MESSAGE) || undefined,
    ip,
    ua: ua.slice(0, 300) || undefined,
    status: 'pending',
    createdAt: Date.now(),
  };
  writeAll([...all, request]);
  return request;
}

export function getRequest(id: string): AccessRequest | null {
  return readAll().find((r) => r.id === id) ?? null;
}

export function decideRequest(id: string, status: 'approved' | 'rejected', by: string): AccessRequest | null {
  const all = readAll();
  const request = all.find((r) => r.id === id && r.status === 'pending');
  if (!request) return null;
  const next = all.map((r) => (r.id === id ? { ...r, status, decidedAt: Date.now(), decidedBy: by } : r));
  writeAll(next);
  return next.find((r) => r.id === id) ?? null;
}
