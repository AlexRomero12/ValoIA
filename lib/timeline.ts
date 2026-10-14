import { cacheSet, findCachedValues } from './cache';
import type { HenrikKill, HenrikMatch, HenrikMatchRound, HenrikPlayerLocation } from './henrik';
import { findMatch, notCachedError, orderedProfiles } from './matchLookup';
import type { ProfileViewer } from './profiles';
import { sidesByRound } from './aperturas';
import { getContent, getMapInfo, type MapCalibration } from './valorant';
import {
  MAP_UNITS,
  type MatchTimeline,
  type TimelineEco,
  type TimelineKill,
  type TimelinePlayer,
  type TimelinePoint,
  type TimelineRound,
  type TimelineView,
  type TimelineWeapon,
  type WeaponKind,
} from './timelineView';

/**
 * Cronología de una partida: ronda a ronda, quién mató a quién, con qué arma y
 * dónde, más plantas/defuses y la economía de cada ronda.
 *
 * Todo sale de la partida ya cacheada/archivada ($0 requests a Henrik): el
 * bucket v4 trae `kills[].location`, `kills[].player_locations` (los vivos con
 * su ángulo de visión), `rounds[].plant/defuse` con posición y
 * `rounds[].stats[]` con la economía por jugador.
 *
 * Las posiciones viajan en MILÉSIMAS del minimapa (enteros 0..1000) para que el
 * cliente no necesite saber el tamaño de la imagen: pinta un SVG con
 * `viewBox="0 0 1000 1000"` y las coloca tal cual. Los tipos y las utilidades
 * puras viven en `lib/timelineView.ts`, que es lo que puede importar el cliente.
 */

const TIMELINE_TTL = 7 * 24 * 60 * 60 * 1000;

/**
 * Mundo → minimapa, en milésimas de la imagen.
 *
 * OJO: los ejes van INTERCAMBIADOS respecto a la fórmula que publica
 * valorant-api. El eje Y del mundo alimenta la horizontal y el X la vertical.
 *
 * Verificado contra la máscara de suelo jugable de los 11 mapas del archivo
 * (8.223 puntos reales solo en Sunset): así el 99-100% de las kills caen en
 * zona jugable; con el orden «natural» solo el 65%, y puntos al azar dan 39%.
 */
export function projectWorld(
  x: number,
  y: number,
  cal: MapCalibration,
  units = MAP_UNITS,
): TimelinePoint {
  return {
    u: clampUnits((y * cal.xMultiplier + cal.xScalarToAdd) * units, units),
    v: clampUnits((x * cal.yMultiplier + cal.yScalarToAdd) * units, units),
  };
}

/**
 * Ángulo de visión del mundo a grados de pantalla.
 *
 * Como el mundo va con los ejes intercambiados, una dirección del mundo
 * (cos a, sen a) se ve en pantalla como (sen a, −cos a). Se devuelve el ángulo
 * en grados con 0° = derecha y sentido horario, que es el que espera SVG.
 */
export function screenAngle(rad: number): number {
  return (Math.atan2(-Math.cos(rad), Math.sin(rad)) * 180) / Math.PI;
}

function clampUnits(v: number, units: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(units, Math.round(v)));
}

function point(loc: { x?: number; y?: number } | null | undefined, cal: MapCalibration): TimelinePoint | null {
  if (!loc || typeof loc.x !== 'number' || typeof loc.y !== 'number') return null;
  if (!Number.isFinite(loc.x) || !Number.isFinite(loc.y)) return null;
  return projectWorld(loc.x, loc.y, cal);
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

export interface WeaponDicts {
  weapons: Map<string, string | null>;
  abilities: Map<string, string | null>;
}

function abilityWeapon(
  name: string,
  dicts: WeaponDicts,
  secondary: boolean,
  inferred: boolean,
): TimelineWeapon {
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
 */
export function resolveWeapon(
  kill: HenrikKill,
  dicts: WeaponDicts,
  ecoWeapon: string | null,
  killerAgent?: string | null,
): TimelineWeapon {
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

export async function getMatchTimeline(
  matchId: string,
  playerId?: string | null,
  viewer?: ProfileViewer,
): Promise<MatchTimeline> {
  const orderedMembers = orderedProfiles(playerId, viewer);
  // v2: las armas de habilidad (Headhunter, Tour De Force, Overdrive) ya no se
  // resuelven como el arma comprada; la clave nueva evita servir 7 días de
  // cronologías con el «≈Classic» que no era.
  const cacheKey = `val:timeline:v2:${orderedMembers[0].id}:${matchId}`;
  const cached = await Promise.resolve(findCachedValues<MatchTimeline>(cacheKey)[0]);
  if (cached) return cached;

  const found = await findMatch(matchId, orderedMembers);
  if (!found) throw notCachedError();
  const dto = await buildTimeline(matchId, found.match, found.ownerPuuid);
  cacheSet(cacheKey, dto, TIMELINE_TTL);
  return dto;
}

export async function buildTimeline(
  matchId: string,
  match: HenrikMatch,
  ownerPuuid: string,
): Promise<MatchTimeline> {
  const notes: string[] = [];
  const dicts = await getContent();
  const agentIconByName = new Map(Object.values(dicts.agents).map((e) => [e.name.toLowerCase(), e.icon]));
  const weaponDicts: WeaponDicts = {
    weapons: new Map(Object.entries(dicts.weapons).map(([k, v]) => [k, v.icon])),
    abilities: new Map(Object.entries(dicts.abilities).map(([k, v]) => [k, v.icon])),
  };

  const mapUuid = match.metadata?.map?.id;
  const mapInfo = await getMapInfo(mapUuid);
  const mapName = match.metadata?.map?.name ?? mapInfo?.name ?? '?';
  const cal = mapInfo?.calibration ?? null;
  if (!cal) {
    notes.push('Este mapa no tiene sistema de coordenadas (los mapas de TDM no lo traen): se ve el feed de rondas, sin plano.');
  }

  // ---------- Plantilla de jugadores ----------
  const players: TimelinePlayer[] = (match.players ?? []).map((p) => ({
    name: p.name ?? '?',
    tag: p.tag ?? '',
    team: p.team_id ?? null,
    isMe: p.puuid === ownerPuuid,
    agent: p.agent?.name ?? '?',
    agentIcon: agentIconByName.get((p.agent?.name ?? '').toLowerCase()) ?? null,
  }));
  const index = new Map<string, number>();
  (match.players ?? []).forEach((p, i) => {
    if (p.puuid) index.set(p.puuid, i);
  });
  // Una kill puede citar a alguien que no está en `players` (raro): se añade
  // para que los índices siempre resuelvan y la UI no se rompa.
  const indexOf = (puuid: string | undefined, fallbackName?: string, team?: string): number => {
    if (!puuid) return -1;
    const hit = index.get(puuid);
    if (hit != null) return hit;
    const i = players.length;
    index.set(puuid, i);
    players.push({
      name: fallbackName ?? '?',
      tag: '',
      team: team ?? null,
      isMe: false,
      agent: '?',
      agentIcon: null,
    });
    return i;
  };

  const me = (match.players ?? []).find((p) => p.puuid === ownerPuuid);
  const myTeamId = me?.team_id ?? null;
  // Mismo criterio que el detalle y Aperturas: si el player no trae team_id,
  // el bando sale del kill feed.
  const sideTeam =
    myTeamId ??
    (match.kills ?? []).find((k) => k.killer?.puuid === ownerPuuid && k.killer?.team)?.killer?.team ??
    (match.kills ?? []).find((k) => k.victim?.puuid === ownerPuuid && k.victim?.team)?.victim?.team ??
    null;
  const myTeam =
    (match.teams ?? []).find((t) => t.team_id != null && t.team_id === myTeamId) ?? (match.teams ?? [])[0];
  const sides = sideTeam ? sidesByRound(match, sideTeam) : new Map<number, 0 | 1>();

  // ---------- Kills agrupadas por ronda ----------
  const killsByRound = new Map<number, HenrikKill[]>();
  let killsWithoutRound = 0;
  for (const k of match.kills ?? []) {
    if (typeof k.round !== 'number') {
      killsWithoutRound += 1;
      continue;
    }
    const list = killsByRound.get(k.round);
    if (list) list.push(k);
    else killsByRound.set(k.round, [k]);
  }
  if (killsWithoutRound > 0) {
    notes.push(`${killsWithoutRound} kill${killsWithoutRound === 1 ? '' : 's'} sin número de ronda: no se pueden situar en la cronología.`);
  }

  // Si la partida no trae rondas, se sintetizan con los números de kill.
  const rawRounds: HenrikMatchRound[] = match.rounds?.length
    ? match.rounds
    : [...killsByRound.keys()].sort((a, b) => a - b).map((id) => ({ id }));

  let killsWithoutPos = 0;
  let inferredWeapons = 0;

  /** Foto de los jugadores vivos: índice, posición y ángulo de visión. */
  const viewsOf = (locs: HenrikPlayerLocation[] | null | undefined): TimelineView[] => {
    const out: TimelineView[] = [];
    if (!cal) return out;
    for (const pl of locs ?? []) {
      const p = indexOf(pl.player?.puuid, pl.player?.name, pl.player?.team);
      const pos = point(pl.location, cal);
      if (p < 0 || !pos) continue;
      out.push({ p, u: pos.u, v: pos.v, deg: Math.round(screenAngle(num(pl.view_radians))) });
    }
    return out;
  };

  const rounds: TimelineRound[] = rawRounds.map((r, idx) => {
    const id = r.id ?? idx;
    const list = [...(killsByRound.get(id) ?? [])].sort(
      (a, b) => (a.time_in_round_in_ms ?? 0) - (b.time_in_round_in_ms ?? 0),
    );

    // Economía de la ronda: también resuelve el arma cuando el feed no la trae.
    const eco: TimelineEco[] = [];
    const ecoWeaponByPuuid = new Map<string, string>();
    for (const s of r.stats ?? []) {
      const puuid = s.player?.puuid;
      const p = indexOf(puuid, s.player?.name, s.player?.team);
      if (p < 0) continue;
      const wname = s.economy?.weapon?.name ?? null;
      if (puuid && wname) ecoWeaponByPuuid.set(puuid, wname);
      eco.push({
        p,
        weapon: wname,
        icon: wname ? (weaponDicts.weapons.get(wname.toLowerCase()) ?? null) : null,
        armor: s.economy?.armor?.name ?? null,
        loadout: num(s.economy?.loadout_value),
        left: num(s.economy?.remaining),
      });
    }

    const kills: TimelineKill[] = list.map((k, i) => {
      const kIdx = indexOf(k.killer?.puuid, k.killer?.name, k.killer?.team);
      const vIdx = indexOf(k.victim?.puuid, k.victim?.name, k.victim?.team);
      const at = cal ? point(k.location, cal) : null;
      if (!at) killsWithoutPos += 1;

      const views = viewsOf(k.player_locations);

      const ecoWeapon = k.killer?.puuid ? (ecoWeaponByPuuid.get(k.killer.puuid) ?? null) : null;
      const w = resolveWeapon(k, weaponDicts, ecoWeapon, players[kIdx]?.agent);
      if (w.inferred) inferredWeapons += 1;

      return {
        t: num(k.time_in_round_in_ms),
        k: kIdx,
        v: vIdx,
        a: (k.assistants ?? [])
          .map((a) => indexOf(a.puuid, a.name))
          .filter((n) => n >= 0),
        w,
        at,
        views,
        ...(i === 0 ? { first: true } : {}),
      };
    });

    const plantEv = r.plant ?? null;
    const defuseEv = r.defuse ?? null;
    const plantPos = cal ? point(plantEv?.location, cal) : null;
    const defusePos = cal ? point(defuseEv?.location, cal) : null;

    return {
      n: id + 1,
      won: r.winning_team != null ? r.winning_team === myTeamId : Boolean(myTeam?.won),
      side: sideOf(sides.get(id)),
      result: r.result ?? '',
      plant:
        plantPos && plantEv
          ? {
              ...plantPos,
              site: plantEv.site ?? '?',
              by: indexOf(plantEv.player?.puuid, plantEv.player?.name, plantEv.player?.team),
              t: num(plantEv.round_time_in_ms),
              views: viewsOf(plantEv.player_locations),
            }
          : null,
      defuse:
        defusePos && defuseEv
          ? {
              ...defusePos,
              by: indexOf(defuseEv.player?.puuid, defuseEv.player?.name, defuseEv.player?.team),
              t: num(defuseEv.round_time_in_ms),
              views: viewsOf(defuseEv.player_locations),
            }
          : null,
      kills,
      eco,
    };
  });

  if (cal && killsWithoutPos > 0) {
    notes.push(`${killsWithoutPos} kill${killsWithoutPos === 1 ? '' : 's'} sin posición: no aparecen en el plano.`);
  }
  if (inferredWeapons > 0) {
    notes.push(
      `${inferredWeapons} kill${inferredWeapons === 1 ? '' : 's'} sin arma en el feed: se dedujo de lo que el asesino compró esa ronda (marcadas con ≈).`,
    );
  }

  return {
    matchId,
    map: {
      name: mapName,
      image: mapInfo?.icon ?? null,
      calibration: cal,
    },
    players,
    rounds,
    notes,
  };
}

function sideOf(side: 0 | 1 | undefined): 'atk' | 'def' | null {
  if (side === 1) return 'atk';
  if (side === 0) return 'def';
  return null;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
