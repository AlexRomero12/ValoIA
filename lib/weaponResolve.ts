import type { HenrikKill, HenrikMatch } from './henrik';

/**
 * De qué arma es cada kill, a partir del kill feed.
 *
 * Vive aparte de `lib/timeline.ts` porque lo necesitan tres sitios: la
 * cronología, el **Arsenal** y el detalle de partida (`lib/valorant.ts`,
 * `lib/matchDetail.ts`). Si estuviera en `timeline`, los otros dos tendrían que
 * importar un módulo que a su vez los importa, y el ciclo no compensa. Este
 * módulo no importa nada con efectos.
 */

export type WeaponKind = 'weapon' | 'ability' | 'spike' | 'fall' | 'melee' | 'other';

export interface ResolvedWeapon {
  name: string;
  icon: string | null;
  kind: WeaponKind;
  /** Disparo secundario (la ráfaga del Classic o el modo alternativo de un arma de habilidad). */
  secondary: boolean;
  /**
   * El feed no traía el arma y se dedujo de lo que el asesino compró esa ronda
   * (o de su agente). No es una invención, pero puede fallar.
   */
  inferred?: boolean;
}

export interface WeaponDicts {
  /** Nombre en minúsculas -> icono. */
  weapons: Map<string, string | null>;
  /** Nombre de habilidad en minúsculas -> icono. */
  abilities: Map<string, string | null>;
}

/**
 * Arma los diccionarios de iconos desde el contenido cacheado (`getContent`).
 *
 * El parámetro es estructural a propósito: así este módulo no tiene que
 * importar `lib/valorant.ts` (que sí lo importa a él) y no se crea un ciclo.
 */
export function weaponDictsFrom(content: {
  weapons?: Record<string, { icon: string | null }>;
  abilities?: Record<string, { icon: string | null }>;
}): WeaponDicts {
  return {
    weapons: new Map(Object.entries(content.weapons ?? {}).map(([k, v]) => [k, v.icon])),
    abilities: new Map(Object.entries(content.abilities ?? {}).map(([k, v]) => [k, v.icon])),
  };
}

/** Todo lo que hace falta para resolver las armas de UNA partida. */
export interface WeaponContext {
  dicts: WeaponDicts;
  /** puuid -> nombre del agente (delata el arma cuando Riot omite el id). */
  agentByPuuid: Map<string, string>;
  /** `${ronda}|${puuid}` -> arma comprada esa ronda (último recurso). */
  ecoByRound: Map<string, string>;
}

/** Índices de una partida: agente por puuid y compra por ronda. */
export function weaponContext(match: HenrikMatch, dicts: WeaponDicts): WeaponContext {
  const agentByPuuid = new Map<string, string>();
  for (const p of match.players ?? []) {
    if (p.puuid && p.agent?.name) agentByPuuid.set(p.puuid, p.agent.name);
  }
  const ecoByRound = new Map<string, string>();
  for (const r of match.rounds ?? []) {
    for (const s of r.stats ?? []) {
      const puuid = s.player?.puuid;
      const wname = s.economy?.weapon?.name;
      if (puuid && wname) ecoByRound.set(`${r.id ?? ''}|${puuid}`, wname);
    }
  }
  return { dicts, agentByPuuid, ecoByRound };
}

/** Resuelve el arma de una kill con el contexto de su partida. */
export function resolveWeaponIn(ctx: WeaponContext, kill: HenrikKill): ResolvedWeapon {
  const killer = kill.killer?.puuid;
  const eco = killer ? (ctx.ecoByRound.get(`${kill.round ?? ''}|${killer}`) ?? null) : null;
  const agent = killer ? (ctx.agentByPuuid.get(killer) ?? null) : null;
  return resolveWeapon(kill, ctx.dicts, eco, agent);
}

/** Clasifica el `type` que manda Riot en el kill feed. */
function kindOf(type: string | null | undefined): WeaponKind {
  const t = (type ?? '').toLowerCase();
  if (t === 'ability') return 'ability';
  if (t === 'bomb') return 'spike';
  if (t === 'fall') return 'fall';
  if (t === 'melee') return 'melee';
  if (t === 'weapon' || t === '') return 'weapon';
  return 'other';
}

/**
 * Armas de habilidad que Riot manda como `type: "Weapon"` y SIN nombre.
 *
 * No están en `/v1/weapons` (son habilidades, no armas comprables), así que se
 * identificaron cruzando las 61.542 kills del archivo: cada uno de estos ids lo
 * usa UN solo agente, al 100%, y su perfil de distancia asesino→cadáver encaja
 * con el arma que dice ser.
 *
 *  - `856d9a7e…` 1.281 kills, 100% Chamber, mediana 1.936u (nivel pistola:
 *    Sheriff 1.793u) y presente en rondas de pistola → **Headhunter**.
 *  - `39099fb5…` 80 kills, 100% Chamber, mediana 2.423u (nivel francotirador:
 *    Operator 2.436u) y NUNCA en ronda de pistola → **Tour De Force**.
 *  - `95336ae4…` 53 kills, 100% Neon, mediana 1.089u (corta distancia, encaja
 *    con su rayo) y nunca en ronda de pistola → **Overdrive**.
 *
 * El `2f59173c…` del melee sí está en el catálogo y se resuelve por tipo.
 */
const ABILITY_WEAPON_IDS: Record<string, string> = {
  '856d9a7e-4b06-dc37-15dc-9d809c37cb90': 'Headhunter',
  '39099fb5-4293-def4-1e09-2e9080ce7456': 'Tour De Force',
  '95336ae4-45d4-1032-cfaf-6bad01910607': 'Overdrive',
};

/**
 * Cuando Riot omite el id, el agente delata el arma.
 *
 * Las 775 kills de tipo Weapon SIN id del archivo son el 100% de Chamber y
 * ninguna cae en ronda de pistola (0 en las rondas 0-1 y 12-13), mientras que
 * la Headhunter sí aparece en ellas (427 kills ahí): ese cajón es la Tour De
 * Force. Su mediana de distancia (2.475u) está en el nivel del Operator
 * (2.436u), no en el de la Headhunter (1.936u).
 */
const ABILITY_WEAPON_BY_AGENT: Record<string, string> = {
  chamber: 'Tour De Force',
};

function abilityWeapon(
  name: string,
  dicts: WeaponDicts,
  secondary: boolean,
  inferred: boolean,
): ResolvedWeapon {
  return {
    name,
    icon: dicts.abilities.get(name.toLowerCase()) ?? null,
    kind: 'ability',
    secondary,
    ...(inferred ? { inferred: true } : {}),
  };
}

/**
 * Resuelve el arma de una kill.
 *
 * Orden (medido sobre 61.542 kills del archivo):
 *  1. El nombre del feed (95,7% de las kills).
 *  2. El tipo, para lo que no es un arma: spike, caída, melee.
 *  3. El id de un arma de habilidad (Headhunter, Tour De Force, Overdrive).
 *  4. El agente, cuando Riot omite el id de su arma de habilidad.
 *  5. El arma que el asesino compró esa ronda (la economía está en el 99,3% de
 *     las rondas). OJO: esto NO vale para las kills de habilidad, porque ahí la
 *     muerte no la causó el arma comprada.
 *
 * Con el paso 3 y 4 resueltos, en el archivo no queda ninguna kill sin
 * identificar: los cinco cajones sin nombre suman exactamente las 2.634 kills
 * que faltaban.
 */
export function resolveWeapon(
  kill: HenrikKill,
  dicts: WeaponDicts,
  ecoWeapon: string | null,
  killerAgent?: string | null,
): ResolvedWeapon {
  const w = kill.weapon ?? {};
  const secondary = Boolean(kill.secondary_fire_mode);
  const type = kindOf(w.type);
  const name = (w.name ?? '').trim();

  if (name) {
    const key = name.toLowerCase();
    const icon = type === 'ability' ? (dicts.abilities.get(key) ?? null) : (dicts.weapons.get(key) ?? null);
    return { name, icon, kind: type, secondary };
  }
  if (type === 'spike') return { name: 'Spike', icon: null, kind: 'spike', secondary };
  if (type === 'fall') return { name: 'Caída', icon: null, kind: 'fall', secondary };
  if (type === 'melee') {
    return { name: 'Melee', icon: dicts.weapons.get('melee') ?? null, kind: 'melee', secondary };
  }

  const byId = w.id ? ABILITY_WEAPON_IDS[w.id.toLowerCase()] : undefined;
  if (byId) return abilityWeapon(byId, dicts, secondary, false);

  // Habilidad sin nombre identificable (el id genérico `grenadeability`): se
  // dice que fue una habilidad en vez de atribuírselo al arma comprada.
  if (type === 'ability') return { name: 'Habilidad', icon: null, kind: 'ability', secondary };

  const byAgent = killerAgent ? ABILITY_WEAPON_BY_AGENT[killerAgent.toLowerCase()] : undefined;
  if (byAgent) return abilityWeapon(byAgent, dicts, secondary, true);

  if (ecoWeapon) {
    const key = ecoWeapon.toLowerCase();
    return {
      name: ecoWeapon,
      icon: dicts.weapons.get(key) ?? null,
      kind: 'weapon',
      secondary,
      inferred: true,
    };
  }
  return { name: '—', icon: null, kind: type, secondary };
}
