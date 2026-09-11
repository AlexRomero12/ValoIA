import type { AuditRules, Profile, ProfileAccount, ProfilePref } from './profileTypes';

/**
 * Export/import de configuración de perfiles (solo datos del perfil, nunca
 * RSO, notas ni historial). Puro y testeable: el cliente arma/lee el archivo y
 * la API hace la validación final al guardar.
 */

export const TRANSFER_KIND = 'valoia.profiles';
export const TRANSFER_VERSION = 1;

export interface ProfileExport {
  label: string;
  name: string;
  tag: string;
  role?: string;
  color?: string;
  visible: boolean;
  primary?: boolean;
  accounts?: ProfileAccount[];
  prefs?: ProfilePref[];
  audit?: AuditRules;
}

export interface TransferFile {
  kind: typeof TRANSFER_KIND;
  version: number;
  exportedAt: string;
  profiles: ProfileExport[];
}

export function toExportable(p: Profile): ProfileExport {
  return {
    label: p.label,
    name: p.name,
    tag: p.tag,
    role: p.role,
    color: p.color,
    visible: p.visible,
    primary: p.primary,
    accounts: p.accounts,
    prefs: p.prefs,
    audit: p.audit,
  };
}

export function buildTransferFile(profiles: Profile[]): string {
  const file: TransferFile = {
    kind: TRANSFER_KIND,
    version: TRANSFER_VERSION,
    exportedAt: new Date().toISOString(),
    profiles: profiles.map(toExportable),
  };
  return JSON.stringify(file, null, 2);
}

/** Nombre de archivo seguro a partir de la etiqueta. */
export function exportFileName(label: string): string {
  const slug =
    label
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'perfil';
  return `${slug}.valoia.json`;
}

function cleanAccount(raw: unknown): ProfileAccount | null {
  if (!raw || typeof raw !== 'object') return null;
  const name = String((raw as { name?: unknown }).name ?? '').trim();
  const tag = String((raw as { tag?: unknown }).tag ?? '').trim();
  return name && tag ? { name, tag } : null;
}

function cleanPref(raw: unknown): ProfilePref | null {
  if (!raw || typeof raw !== 'object') return null;
  const map = String((raw as { map?: unknown }).map ?? '').trim();
  const agentsRaw = (raw as { agents?: unknown }).agents;
  const agents = Array.isArray(agentsRaw) ? agentsRaw.map(String).map((a) => a.trim()).filter(Boolean) : [];
  return map && agents.length ? { map, agents } : null;
}

function cleanProfileExport(raw: unknown): ProfileExport | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = String(r.name ?? '').trim();
  const tag = String(r.tag ?? '').trim();
  if (!name || !tag) return null;
  const accounts = Array.isArray(r.accounts)
    ? r.accounts.map(cleanAccount).filter((a): a is ProfileAccount => a !== null)
    : undefined;
  const prefs = Array.isArray(r.prefs)
    ? r.prefs.map(cleanPref).filter((p): p is ProfilePref => p !== null)
    : undefined;
  return {
    label: String(r.label ?? '').trim() || name,
    name,
    tag,
    role: typeof r.role === 'string' && r.role.trim() ? r.role.trim() : undefined,
    color: typeof r.color === 'string' && r.color.trim() ? r.color.trim() : undefined,
    visible: r.visible !== false,
    primary: r.primary === true,
    accounts,
    prefs,
    audit: r.audit && typeof r.audit === 'object' ? (r.audit as AuditRules) : undefined,
  };
}

export type ParseImportResult = { profiles: ProfileExport[] } | { error: string };

/**
 * Acepta el envelope (`{ kind, version, profiles }`), un array de perfiles o
 * un perfil suelto (compatibilidad). Valida lo mínimo antes de guardar.
 */
export function parseTransferFile(text: string): ParseImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: 'El archivo no es un JSON válido.' };
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const version = (raw as { version?: unknown }).version;
    if (typeof version === 'number' && version > TRANSFER_VERSION) {
      return { error: `El archivo viene de una versión más nueva de ValoIA (v${version}).` };
    }
  }
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { profiles?: unknown }).profiles)
      ? ((raw as { profiles: unknown[] }).profiles)
      : raw && typeof raw === 'object' && ((raw as { name?: unknown }).name || (raw as { tag?: unknown }).tag)
        ? [raw]
        : [];
  if (!list.length) return { error: 'El archivo no contiene perfiles.' };
  const profiles = list.map(cleanProfileExport).filter((p): p is ProfileExport => p !== null);
  if (!profiles.length) return { error: 'Ningún perfil del archivo tiene nombre y tag válidos.' };
  return { profiles };
}
