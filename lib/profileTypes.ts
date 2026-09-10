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
export interface AuditPoolRule {
  main: string[];
  backup: string[];
}

/**
 * Reglas de auditoría por perfil. `rulesVersion` sube al editar y acompaña a
 * los snapshots: cambiar reglas no reescribe la evaluación de semanas viejas.
 */
export interface AuditRules {
  rulesVersion: number;
  pool: {
    /** Regla para mapas sin entrada en `byMap` */
    default?: AuditPoolRule;
    byMap: Record<string, AuditPoolRule>;
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
  /** Perfil principal del DUEÑO: es el único que audita su página Auditoría. */
  primary?: boolean;
  /** Usuario dueño del perfil (aislamiento; el admin ve todos). */
  owner?: string;
  /** Cuentas alternativas del mismo jugador (stats mezcladas en Comparar). */
  accounts?: ProfileAccount[];
  prefs?: ProfilePref[];
  /** Reglas de auditoría; ausente = defaults globales sin pool. */
  audit?: AuditRules;
}

/** Lista de cuentas (principal + alternativas) de un perfil. */
export function memberAccounts(profile: Profile): ProfileAccount[] {
  return [{ name: profile.name, tag: profile.tag }, ...(profile.accounts ?? [])];
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

/** Perfil principal (o el primer visible, o el primero) — para Auditoría. */
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
export function poolRuleFor(rules: AuditRules | undefined, map: string): AuditPoolRule | null {
  if (!rules) return null;
  const mapRule = rules.pool.byMap[map];
  if (mapRule && (mapRule.main.length > 0 || mapRule.backup.length > 0)) return mapRule;
  const def = rules.pool.default;
  if (def && (def.main.length > 0 || def.backup.length > 0)) return def;
  return null;
}

/** Reglas vacías (solo defaults de corte/pausa) para el editor. */
export function emptyAuditRules(): AuditRules {
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
export function cloneAuditRules(rules: AuditRules): AuditRules {
  return JSON.parse(JSON.stringify(rules)) as AuditRules;
}
