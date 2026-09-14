/**
 * Tipos y helpers PUROS de perfiles (sin `node:fs`): este módulo se importa
 * desde el client bundle (páginas, componentes, hooks). La persistencia vive
 * en `lib/profiles.ts` (server-only).
 */

export interface ProfileAccount {
  name: string;
  tag: string;
}

/** Preferencia manual: agente(s) por mapa (gana sobre el score automático). */
export interface ProfilePref {
  map: string;
  agents: string[];
}

/** Regla de pool de un mapa: principales y backups. */
export interface PoolRule {
  main: string[];
  backup: string[];
}

/** Límites del pool: un principal y hasta dos backups por mapa. */
export const POOL_MAIN_MAX = 1;
export const POOL_BACKUP_MAX = 2;

/** Normaliza una regla de pool: sin duplicados, 1 principal y hasta 2 backups. */
export function clampPoolRule(rule?: Partial<PoolRule> | null): PoolRule {
  const main = [...new Set(rule?.main ?? [])].slice(0, POOL_MAIN_MAX);
  const mainSet = new Set(main);
  const backup = [...new Set(rule?.backup ?? [])]
    .filter((a) => !mainSet.has(a))
    .slice(0, POOL_BACKUP_MAX);
  return { main, backup };
}

/** Aplica los límites del pool a todas las reglas (default y por mapa). */
export function clampRulesPools(rules: SessionRules): SessionRules {
  return {
    ...rules,
    pool: {
      default: rules.pool.default ? clampPoolRule(rules.pool.default) : undefined,
      byMap: Object.fromEntries(
        Object.entries(rules.pool.byMap).map(([map, rule]) => [map, clampPoolRule(rule)]),
      ),
    },
  };
}

/**
 * Reglas de sesión por perfil. `rulesVersion` sube al editar y acompaña a
 * los snapshots: cambiar reglas no reescribe la evaluación de semanas viejas.
 */
export interface SessionRules {
  rulesVersion: number;
  pool: {
    /** Regla para mapas sin entrada en `byMap` */
    default?: PoolRule;
    byMap: Record<string, PoolRule>;
  };
  bannedAgents: string[];
  bannedRoles: string[];
  stop: { losses: number; kdBelow: number };
  sessions: { gapMinutes: number };
  goals: {
    wr?: number;
    kd?: number;
    acs?: number;
    hsPct?: number;
    adr?: number;
    fbPositive?: boolean;
  };
}

export interface Profile {
  id: string;
  label: string;
  name: string;
  tag: string;
  role?: string;
  color?: string;
  /** Aparece en los selectores de Ranked (y por defecto en el resto). */
  visible: boolean;
  /** Perfil principal del DUEÑO: es el único que se evalúa en la página Reglas. */
  primary?: boolean;
  /** Usuario dueño del perfil (aislamiento; el admin ve todos). */
  owner?: string;
  /** Cuentas alternativas del mismo jugador (stats mezcladas en Comparar). */
  accounts?: ProfileAccount[];
  prefs?: ProfilePref[];
  /** Reglas de sesión; ausente = defaults globales sin pool. */
  rules?: SessionRules;
  /** Perfil de otro usuario con opt-in público (solo lectura en comparativas). */
  publicRead?: boolean;
  /** Etiqueta del dueño cuando el perfil es público (para la UI). */
  ownerName?: string;
}

/** Lista de cuentas (principal + alternativas) de un perfil. */
export function memberAccounts(profile: Profile): ProfileAccount[] {
  return [{ name: profile.name, tag: profile.tag }, ...(profile.accounts ?? [])];
}

/**
 * `role` se guarda como string separado por `/` (p. ej. "Duelist/Sentinel"):
 * parse/join mantienen compatibilidad con los perfiles ya guardados.
 */
export function parseRoles(role?: string | null): string[] {
  return (role ?? '')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function joinRoles(roles: string[]): string {
  return roles.map((r) => r.trim()).filter(Boolean).join('/');
}

export const PROFILE_COLORS = [
  '#ff4655',
  '#35b6ff',
  '#e8c97a',
  '#2fd08a',
  '#b98cff',
  '#ff8f5c',
  '#5ce1e6',
  '#f45b9b',
  '#9fdc4a',
  '#8fa7ff',
] as const;

/** Color estable de un perfil: el suyo, o la paleta según su posición. */
export function profileColor(profile: Pick<Profile, 'color'>, index = 0): string {
  return profile.color || PROFILE_COLORS[index % PROFILE_COLORS.length];
}

/** Perfil principal (o el primer visible, o el primero) — para Reglas. */
export function primaryOf(profiles: Profile[]): Profile | undefined {
  return profiles.find((p) => p.primary) ?? profiles.find((p) => p.visible) ?? profiles[0];
}

/** Genera un id único a partir de la etiqueta (slug). */
export function slugifyId(label: string, taken: Set<string>): string {
  const base =
    label
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'perfil';
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

/** Regla de pool de un mapa: `byMap[mapa]` o la default (o null si no hay). */
export function poolRuleFor(rules: SessionRules | undefined, map: string): PoolRule | null {
  if (!rules) return null;
  const mapRule = rules.pool.byMap[map];
  if (mapRule && (mapRule.main.length > 0 || mapRule.backup.length > 0)) return mapRule;
  const def = rules.pool.default;
  if (def && (def.main.length > 0 || def.backup.length > 0)) return def;
  return null;
}

/** Reglas vacías (solo defaults de corte/pausa) para el editor. */
export function emptySessionRules(): SessionRules {
  return {
    rulesVersion: 1,
    pool: { default: { main: [], backup: [] }, byMap: {} },
    bannedAgents: [],
    bannedRoles: [],
    stop: { losses: 2, kdBelow: 0.9 },
    sessions: { gapMinutes: 180 },
    goals: {},
  };
}

/** Copia profunda de reglas (al duplicar/copiar entre perfiles). */
export function cloneSessionRules(rules: SessionRules): SessionRules {
  return JSON.parse(JSON.stringify(rules)) as SessionRules;
}

/**
 * Compara el contenido de dos reglas ignorando `rulesVersion` y el orden de
 * listas/mapas: sirve para saber si una propuesta ya está aplicada tal cual.
 */
export function sameRulesContent(a?: SessionRules | null, b?: SessionRules | null): boolean {
  if (!a || !b) return false;
  const normRule = (r?: PoolRule) => ({
    main: [...(r?.main ?? [])].sort(),
    backup: [...(r?.backup ?? [])].sort(),
  });
  const norm = (r: SessionRules) =>
    JSON.stringify({
      pool: {
        default: normRule(r.pool.default),
        byMap: Object.fromEntries(
          Object.entries(r.pool.byMap)
            .sort(([x], [y]) => x.localeCompare(y))
            .map(([k, v]) => [k, normRule(v)]),
        ),
      },
      bannedAgents: [...r.bannedAgents].sort(),
      bannedRoles: [...r.bannedRoles].sort(),
      stop: { losses: r.stop.losses, kdBelow: r.stop.kdBelow },
      sessions: { gapMinutes: r.sessions.gapMinutes },
      goals: {
        wr: r.goals.wr,
        kd: r.goals.kd,
        acs: r.goals.acs,
        hsPct: r.goals.hsPct,
        adr: r.goals.adr,
        fbPositive: r.goals.fbPositive,
      },
    });
  return norm(a) === norm(b);
}
