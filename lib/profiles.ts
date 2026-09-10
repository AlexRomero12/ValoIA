import { readData, writeData } from './persist';
import type { AuditPoolRule, AuditRules, Profile, ProfileAccount } from './profileTypes';
import { memberAccounts, slugifyId } from './profileTypes';

/**
 * Store de perfiles (server-only, usa `node:fs`).
 *
 * Durabilidad: mismo patrón que favoritas/comentarios — `data/profiles.json`
 * (volumen Docker `valo-data`), externo al cache, con writes atómicos.
 *
 * El primer GET siembra el archivo con el cuarteto original (Player, Player2,
 * Player3, Player4) y las reglas de auditoría del `champion_pool.md` de Player, así
 * la app arranca con los datos que ya existían sin perder nada.
 */

interface ProfilesFile {
  version: number;
  profiles: Profile[];
}

const PROFILES_FILE = 'profiles.json';

/** Reglas de auditoría de Player (champion_pool.md + plan_mejora_player.md). */
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
    name: 'Player3 十六',
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
  writeData(PROFILES_FILE, { version: 1, profiles });
}

/** Lista completa; siembra el archivo la primera vez. */
export function listProfiles(): Profile[] {
  const current = readFile();
  if (current.length === 0) {
    writeFile(SEED_PROFILES);
    return SEED_PROFILES;
  }
  // Migración: si ningún perfil es principal (archivo de antes del flag),
  // se marca el primer visible para que Auditoría/Tienda tengan destino.
  if (!current.some((p) => p.primary)) {
    const idx = Math.max(0, current.findIndex((p) => p.visible));
    const next = current.map((p, i) => (i === idx ? { ...p, primary: true } : p));
    writeFile(next);
    return next;
  }
  return current;
}

/** Lista solo los visibles (Ranked y calentamiento). */
export function listVisibleProfiles(): Profile[] {
  return listProfiles().filter((p) => p.visible);
}

/** Perfil principal (o el primer visible, o el primero) — lo usa Auditoría. */
export function getPrimaryProfile(): Profile {
  const profiles = listProfiles();
  return profiles.find((p) => p.primary) ?? profiles.find((p) => p.visible) ?? profiles[0];
}

/** Resuelve por id; sin id (o desconocido) devuelve el primero. */
export function getProfile(id?: string | null): Profile {
  const profiles = listProfiles();
  if (id) {
    const found = profiles.find((p) => p.id === id);
    if (found) return found;
  }
  return profiles[0];
}

export function isValidProfile(id?: string | null): boolean {
  if (!id) return true;
  return listProfiles().some((p) => p.id === id);
}

export { memberAccounts };

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
  /** true lo vuelve principal (y desmarca a los demás) */
  primary?: boolean;
  accounts?: ProfileAccount[];
  prefs?: Profile['prefs'];
  /** null = quitar reglas; undefined = conservar las existentes */
  audit?: AuditRules | null;
}

/** Crea o actualiza un perfil (match por id). Devuelve la lista completa. */
export function upsertProfile(input: UpsertProfileInput): Profile[] {
  const profiles = listProfiles();
  const name = String(input.name ?? '').trim();
  const tag = String(input.tag ?? '').trim();
  if (!name || !tag) throw new Error('El perfil necesita Riot ID (nombre#tag)');
  const existing = input.id ? profiles.find((p) => p.id === input.id) : undefined;

  const label = String(input.label ?? '').trim() || existing?.label || name;
  const id = existing?.id ?? slugifyId(label, new Set(profiles.map((p) => p.id)));
  const next: Profile = {
    id,
    label,
    name,
    tag,
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
  // Solo puede haber un principal: al marcarlo, se desmarca cualquier otro.
  if (next.primary) merged = merged.map((p) => (p.id === id ? p : { ...p, primary: false }));
  writeFile(merged);
  return merged;
}

/** Borra un perfil (nunca deja la lista vacía). Devuelve la lista completa. */
export function deleteProfile(id: string): Profile[] {
  const profiles = listProfiles();
  const next = profiles.filter((p) => p.id !== id);
  if (next.length === profiles.length) return profiles;
  if (next.length === 0) throw new Error('No puedes borrar el último perfil');
  writeFile(next);
  return next;
}

/** Reglas de auditoría de un perfil (undefined = sin pool configurado). */
export function auditRulesOf(profile: Profile): AuditRules | undefined {
  return profile.audit;
}
