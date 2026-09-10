import { readData, writeDataSync } from './persist';
import type { AuditPoolRule, AuditRules, Profile, ProfileAccount } from './profileTypes';
import { slugifyId } from './profileTypes';
import { adminUsername } from './auth';

/**
 * Store de perfiles (server-only, usa `node:fs`).
 *
 * Durabilidad: mismo patrÃ³n que favoritas/comentarios â€” `data/profiles.json`
 * (volumen Docker `valo-data`), externo al cache, con writes atÃ³micos.
 *
 * El primer GET siembra el archivo con el cuarteto original (Player, Player2,
 * Player3, Player4) y las reglas de auditorÃ­a del `champion_pool.md` de Player, asÃ­
 * la app arranca con los datos que ya existÃ­an sin perder nada.
 */

interface ProfilesFile {
  version: number;
  profiles: Profile[];
}

const PROFILES_FILE = 'profiles.json';

/** Reglas de auditorÃ­a de Player (champion_pool.md + plan_mejora_player.md). */
const ALEX_AUDIT: AuditRules = {
  rulesVersion: 1,
  pool: {
    default: { main: ['Jett', 'Raze', 'Chamber'], backup: ['Sage'] },
    byMap: {
      Ascent: { main: ['Jett'], backup: ['Chamber'] },
      Haven: { main: ['Chamber'], backup: ['Sage'] },
      Sunset: { main: ['Chamber'], backup: ['Raze'] },
      Lotus: { main: ['Raze'], backup: ['Jett', 'Sage'] },
      Split: { main: ['Raze'], backup: ['Sage', 'Jett'] },
      Summit: { main: ['Chamber'], backup: ['Sage'] },
      Abyss: { main: ['Jett', 'Raze'], backup: [] },
    },
  },
  bannedAgents: [],
  bannedRoles: ['Initiator'],
  stop: { losses: 2, kdBelow: 0.9 },
  sessions: { gapMinutes: 180 },
  goals: { wr: 55, kd: 1.05, acs: 220, hsPct: 25, adr: 150, fbPositive: true },
};

const SEED_PROFILES: Profile[] = [
  {
    id: 'player',
    label: 'Player',
    name: 'Player',
    tag: 'LAN',
    role: 'Duelist/Sentinel',
    color: '#ff4655',
    visible: true,
    primary: true,
    prefs: [
      { map: 'Haven', agents: ['Chamber'] },
      { map: 'Sunset', agents: ['Chamber'] },
      { map: 'Split', agents: ['Sage', 'Raze', 'Jett'] },
    ],
    audit: ALEX_AUDIT,
  },
  {
    id: 'player2',
    label: 'Player2',
    name: 'Player2',
    tag: '0000',
    role: 'Sentinel',
    color: '#35b6ff',
    visible: true,
    prefs: [
      { map: 'Haven', agents: ['Yoru', 'Cypher'] },
      { map: 'Ascent', agents: ['Killjoy'] },
    ],
  },
  {
    id: 'player3',
    label: 'Player3',
    name: 'Player3 åå…­',
    tag: '0616',
    role: 'Flex Sentinel/Controller',
    color: '#e8c97a',
    visible: true,
  },
  {
    id: 'player4',
    label: 'Player4',
    name: 'Player4',
    tag: 'lol',
    role: 'Initiator/Controller',
    color: '#2fd08a',
    visible: true,
    accounts: [
      { name: 'Player4', tag: 'Rol' },
      { name: 'Player5', tag: 'NA1' },
    ],
    prefs: [
      { map: 'Haven', agents: ['Sova'] },
      { map: 'Ascent', agents: ['Sova'] },
      { map: 'Abyss', agents: ['Sova'] },
    ],
  },
];

function readFile(): Profile[] {
  const file = readData<ProfilesFile>(PROFILES_FILE, { version: 1, profiles: [] });
  return Array.isArray(file?.profiles) ? file.profiles : [];
}

function writeFile(profiles: Profile[]): void {
  writeDataSync(PROFILES_FILE, { version: 1, profiles });
}

/** Lista completa (con migraciones); incluye el dueÃ±o de cada perfil. */
export function listProfiles(): Profile[] {
  const current = readFile();
  const defaultOwner = adminUsername() ?? 'player';
  if (current.length === 0) {
    const seeded = SEED_PROFILES.map((p) => ({ ...p, owner: defaultOwner }));
    writeFile(seeded);
    return seeded;
  }
  let next = current;
  let changed = false;
  // MigraciÃ³n: perfiles previos al aislamiento -> dueÃ±o = admin.
  if (next.some((p) => !p.owner)) {
    next = next.map((p) => (p.owner ? p : { ...p, owner: defaultOwner }));
    changed = true;
  }
  // Un principal por dueÃ±o (la AuditorÃ­a de cada usuario usa el suyo).
  for (const owner of new Set(next.map((p) => p.owner ?? defaultOwner))) {
    const own = next.filter((p) => (p.owner ?? defaultOwner) === owner);
    if (!own.some((p) => p.primary)) {
      const first = own.find((p) => p.visible) ?? own[0];
      next = next.map((p) => (p.id === first.id ? { ...p, primary: true } : p));
      changed = true;
    }
  }
  if (changed) writeFile(next);
  return next;
}

/** QuiÃ©n consulta: el admin ve todo; cada usuario, solo sus perfiles. */
export interface ProfileViewer {
  username: string;
  admin: boolean;
}

export function canAccessProfile(profile: Profile, viewer: ProfileViewer): boolean {
  return viewer.admin || !profile.owner || profile.owner === viewer.username;
}

/** Perfiles visibles para un usuario (propios primero, para el principal). */
export function listProfilesFor(viewer: ProfileViewer): Profile[] {
  const all = listProfiles();
  if (viewer.admin) {
    return [...all.filter((p) => p.owner === viewer.username), ...all.filter((p) => p.owner !== viewer.username)];
  }
  return all.filter((p) => p.owner === viewer.username);
}

export function listVisibleProfilesFor(viewer: ProfileViewer): Profile[] {
  return listProfilesFor(viewer).filter((p) => p.visible);
}

/** Filtra una lista en memoria segÃºn el visor (para respuestas tras mutar). */
export function scopeProfiles(profiles: Profile[], viewer: ProfileViewer): Profile[] {
  if (viewer.admin) {
    return [...profiles.filter((p) => p.owner === viewer.username), ...profiles.filter((p) => p.owner !== viewer.username)];
  }
  return profiles.filter((p) => p.owner === viewer.username);
}

/** Lista solo los visibles (calentamiento global del cron). */
export function listVisibleProfiles(): Profile[] {
  return listProfiles().filter((p) => p.visible);
}

/** Perfil principal de un dueÃ±o (o el global si no se indica). */
export function getPrimaryProfile(owner?: string | null): Profile {
  const profiles = listProfiles();
  const scope = owner ? profiles.filter((p) => p.owner === owner) : profiles;
  const list = scope.length > 0 ? scope : profiles;
  return list.find((p) => p.primary) ?? list.find((p) => p.visible) ?? list[0];
}

/** Principal del admin: es el que manda en la Tienda (sesiÃ³n Riot Ãºnica). */
export function getStorePrimaryProfile(): Profile {
  return getPrimaryProfile(adminUsername());
}

/** Motivo de acceso a un id: para mapear 400/403 en las rutas. */
export function profileAccess(id: string | null | undefined, viewer: ProfileViewer): 'ok' | 'notfound' | 'forbidden' {
  if (!id) return 'ok';
  const profile = listProfiles().find((p) => p.id === id);
  if (!profile) return 'notfound';
  return canAccessProfile(profile, viewer) ? 'ok' : 'forbidden';
}

/** Resuelve por id dentro de lo permitido; sin id (o desconocido) devuelve el primero permitido. */
export function getProfile(id?: string | null, viewer?: ProfileViewer): Profile {
  const profiles = listProfiles();
  const allowed = viewer ? profiles.filter((p) => canAccessProfile(p, viewer)) : profiles;
  const list = allowed.length > 0 ? allowed : profiles;
  if (id) {
    const found = list.find((p) => p.id === id);
    if (found) return found;
  }
  return list[0];
}

export function isValidProfile(id?: string | null, viewer?: ProfileViewer): boolean {
  if (!id) return true;
  if (!viewer) return listProfiles().some((p) => p.id === id);
  return listProfiles().some((p) => p.id === id && canAccessProfile(p, viewer));
}

function cleanAccounts(accounts: unknown): ProfileAccount[] | undefined {
  if (!Array.isArray(accounts)) return undefined;
  const out = accounts
    .map((a) => ({ name: String((a as ProfileAccount)?.name ?? '').trim(), tag: String((a as ProfileAccount)?.tag ?? '').trim() }))
    .filter((a) => a.name && a.tag);
  return out.length ? out : undefined;
}

function cleanPrefs(prefs: unknown): Profile['prefs'] {
  if (!Array.isArray(prefs)) return undefined;
  const out = prefs
    .map((p) => {
      const row = p as { map?: unknown; agents?: unknown };
      const map = String(row?.map ?? '').trim();
      const agents = Array.isArray(row?.agents) ? row.agents.map((a) => String(a).trim()).filter(Boolean) : [];
      return map && agents.length ? { map, agents } : null;
    })
    .filter((p): p is { map: string; agents: string[] } => p != null);
  return out.length ? out : undefined;
}

function cleanAudit(audit: unknown, previousVersion = 0): AuditRules | undefined {
  if (!audit || typeof audit !== 'object') return undefined;
  const a = audit as Partial<AuditRules>;
  const byMap: Record<string, AuditPoolRule> = {};
  const rawByMap = (a.pool?.byMap ?? {}) as Record<string, Partial<AuditPoolRule>>;
  for (const [map, rule] of Object.entries(rawByMap)) {
    byMap[map] = {
      main: Array.isArray(rule?.main) ? rule.main.map(String).filter(Boolean) : [],
      backup: Array.isArray(rule?.backup) ? rule.backup.map(String).filter(Boolean) : [],
    };
  }
  const def = a.pool?.default;
  return {
    rulesVersion: Math.max(1, Number(previousVersion) + 1 || Number(a.rulesVersion) || 1),
    pool: {
      default: def
        ? {
            main: Array.isArray(def.main) ? def.main.map(String).filter(Boolean) : [],
            backup: Array.isArray(def.backup) ? def.backup.map(String).filter(Boolean) : [],
          }
        : undefined,
      byMap,
    },
    bannedAgents: Array.isArray(a.bannedAgents) ? a.bannedAgents.map(String).filter(Boolean) : [],
    bannedRoles: Array.isArray(a.bannedRoles) ? a.bannedRoles.map(String).filter(Boolean) : [],
    stop: {
      losses: Math.max(1, Math.floor(Number(a.stop?.losses) || 2)),
      kdBelow: Math.max(0, Number(a.stop?.kdBelow) || 0.9),
    },
    sessions: { gapMinutes: Math.max(1, Math.floor(Number(a.sessions?.gapMinutes) || 180)) },
    goals: {
      wr: a.goals?.wr != null ? Number(a.goals.wr) : undefined,
      kd: a.goals?.kd != null ? Number(a.goals.kd) : undefined,
      acs: a.goals?.acs != null ? Number(a.goals.acs) : undefined,
      hsPct: a.goals?.hsPct != null ? Number(a.goals.hsPct) : undefined,
      adr: a.goals?.adr != null ? Number(a.goals.adr) : undefined,
      fbPositive: Boolean(a.goals?.fbPositive),
    },
  };
}

export interface UpsertProfileInput {
  id?: string;
  label?: string;
  name?: string;
  tag?: string;
  role?: string;
  color?: string;
  visible?: boolean;
  /** true lo vuelve principal (y desmarca a los demÃ¡s) */
  primary?: boolean;
  accounts?: ProfileAccount[];
  prefs?: Profile['prefs'];
  /** null = quitar reglas; undefined = conservar las existentes */
  audit?: AuditRules | null;
}

function forbidden(message = 'No tienes permiso sobre este perfil'): Error {
  return Object.assign(new Error(message), { code: 'FORBIDDEN' });
}

function profileLimit(owner: string): number {
  const isOwnerAdmin = owner === adminUsername();
  const raw = Number(process.env[isOwnerAdmin ? 'MAX_PROFILES_ADMIN' : 'MAX_PROFILES'] ?? '');
  const fallback = isOwnerAdmin ? 20 : 10;
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : fallback;
}

/**
 * Crea o actualiza un perfil (match por id) para el visor.
 * - Nuevo: queda con `owner = visor.username` y respeta el tope de perfiles.
 * - Existente: el visor debe ser el dueño o admin.
 * - `primary` se desmarca solo entre los perfiles del MISMO dueño.
 */
export function upsertProfile(input: UpsertProfileInput, viewer: ProfileViewer): Profile[] {
  const profiles = listProfiles();
  const name = String(input.name ?? '').trim();
  const tag = String(input.tag ?? '').trim();
  if (!name || !tag) throw new Error('El perfil necesita Riot ID (nombre#tag)');
  const existing = input.id ? profiles.find((p) => p.id === input.id) : undefined;
  if (existing && !canAccessProfile(existing, viewer)) throw forbidden();

  const owner = existing?.owner ?? viewer.username;
  if (!existing) {
    const cap = profileLimit(owner);
    const owned = profiles.filter((p) => p.owner === owner).length;
    if (owned >= cap) {
      throw Object.assign(new Error(`Alcanzaste el máximo de ${cap} perfiles`), { code: 'LIMIT' });
    }
  }

  const label = String(input.label ?? '').trim() || existing?.label || name;
  const id = existing?.id ?? slugifyId(label, new Set(profiles.map((p) => p.id)));
  const next: Profile = {
    id,
    label,
    name,
    tag,
    owner,
    role: String(input.role ?? existing?.role ?? '').trim() || undefined,
    color: String(input.color ?? existing?.color ?? '').trim() || undefined,
    visible: input.visible ?? existing?.visible ?? true,
    primary: input.primary ?? existing?.primary ?? false,
    accounts: cleanAccounts(input.accounts) ?? existing?.accounts,
    prefs: cleanPrefs(input.prefs) ?? existing?.prefs,
    audit:
      input.audit === null
        ? undefined
        : cleanAudit(input.audit, existing?.audit?.rulesVersion ?? 0) ?? existing?.audit,
  };

  let merged = existing ? profiles.map((p) => (p.id === id ? next : p)) : [...profiles, next];
  // Un principal por dueÃ±o: al marcarlo, se desmarcan los demÃ¡s del mismo dueÃ±o.
  if (next.primary) {
    merged = merged.map((p) => (p.id === id ? p : p.owner === owner ? { ...p, primary: false } : p));
  }
  writeFile(merged);
  return merged;
}

/** Borra un perfil del visor (nunca deja la lista vacÃ­a). Devuelve la lista completa. */
export function deleteProfile(id: string, viewer: ProfileViewer): Profile[] {
  const profiles = listProfiles();
  const target = profiles.find((p) => p.id === id);
  if (!target) return profiles;
  if (!canAccessProfile(target, viewer)) throw forbidden();
  const next = profiles.filter((p) => p.id !== id);
  if (next.length === 0) throw new Error('No puedes borrar el Ãºltimo perfil');
  writeFile(next);
  return next;
}
