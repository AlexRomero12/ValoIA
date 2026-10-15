import type { HenrikMatch } from './henrik';
import { getContent, getMapInfo, type MapCallout } from './valorant';
import { sidesByRound } from './aperturas';
import { resolveWeaponIn, weaponContext, weaponDictsFrom, type WeaponKind } from './weaponResolve';

/**
 * Contexto de las muertes del jugador: **dónde** cae, **cómo** lo matan y las
 * señales objetivas con las que se puede construir un **por qué**.
 *
 * El módulo NO juzga: devuelve hechos medibles (zona del mapa, arma, distancia
 * del duelo, si estaba solo, si le tradearon, si fue la apertura…) y un puñado
 * de etiquetas. La interpretación («entras solo», «peekea sin info») es de quien
 * lee el informe.
 *
 * Todo sale de las partidas ya archivadas o cacheadas: $0 requests a Henrik.
 */

/** A esta distancia (unidades de mundo) un compañero cuenta como «al lado». */
const NEAR = 1200;
/** Ventana para considerar que te tradearon, desde tu muerte. */
const TRADE_MS = 8000;
/** A partir de aquí el duelo es largo; por debajo de SHORT, cuerpo a cuerpo. */
const LONG_RANGE = 2500;
const SHORT_RANGE = 600;
/** Margen del cono de visión para decir que el asesino te apuntaba. */
const FACING_DEG = 60;
/** Mi loadout por debajo de esta fracción del suyo = desventaja de economía. */
const ECO_RATIO = 0.6;
/** Tope de filas devueltas en `spots` (los agregados van siempre completos). */
const SPOTS_LIMIT = 250;

export interface DeathSpot {
  matchId: string;
  /** ms epoch del inicio de la partida. */
  startedAt: number;
  map: string;
  agent: string;
  round: number;
  /** ms desde el inicio de la ronda. */
  t: number;
  side: 'atk' | 'def' | null;
  /** Zona del mapa donde caí («A Main», «Mid Courtyard»…). */
  zone: string | null;
  /** Zona padre: «A», «B», «Mid», «Attacker Side»… */
  area: string | null;
  /** Posición exacta, en coordenadas de mundo. */
  x: number;
  y: number;
  killer: string;
  killerAgent: string | null;
  weapon: string;
  weaponKind: WeaponKind;
  /** Distancia del duelo, en unidades de mundo. */
  dist: number;
  /** true si el asesino apuntaba hacia mí; null si no hay dato de su vista. */
  facing: boolean | null;
  /** Fui la primera muerte de la ronda. */
  opening: boolean;
  /** Compañeros y rivales a menos de NEAR en ese instante (sin contarme). */
  matesNear: number;
  enemiesNear: number;
  /** Un compañero mató a mi asesino poco después. */
  traded: boolean;
  /** Quién había plantado el spike antes de que yo muriera. */
  spike: 'mine' | 'theirs' | null;
  myLoadout: number;
  killerLoadout: number;
  /** Señales objetivas. El «por qué» lo pone quien interpreta. */
  tags: string[];
}

export interface DeathReport {
  player: string;
  /** Rango de fechas consultado (ISO, solo día). */
  from: string;
  to: string;
  matches: number;
  rounds: number;
  deaths: number;
  /**
   * Baseline para leer las señales: en los instantes de kill en los que SEGUÍA
   * vivo, ¿estaba igual de solo? Sin esto, «el 70% de mis muertes son en
   * solitario» no dice nada: si ya juego disperso, es lo normal.
   */
  baseline: {
    /** Instantes de kill conmigo vivo (la muestra de comparación). */
    aliveSamples: number;
    /** % de esos instantes sin compañero a menos de NEAR. */
    aloneAlivePct: number;
    /** % de mis muertes sin compañero a menos de NEAR. */
    aloneDeathPct: number;
  };
  /** Dónde muero: por mapa y zona, con cuántas fueron apertura o en solitario. */
  zones: { map: string; zone: string; area: string | null; deaths: number; openings: number; alone: number }[];
  maps: { map: string; rounds: number; deaths: number; openings: number; alone: number; traded: number }[];
  sides: { side: 'atk' | 'def'; deaths: number; openings: number }[];
  /** Con qué me matan. */
  weapons: { weapon: string; kind: WeaponKind; deaths: number }[];
  /** Quién me mata (y con qué). */
  killers: { killer: string; agent: string | null; weapon: string; times: number }[];
  /** Cuántas muertes llevan cada señal, sobre el total. */
  signals: { tag: string; count: number; pct: number }[];
  spots: DeathSpot[];
}

/** Distancia euclídea en el plano del mapa. */
export function dist2d(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Diferencia entre dos ángulos, normalizada a (-180, 180].
 *
 * El kill feed da la vista en radianes de mundo y el vector asesino→cadáver se
 * calcula con `atan2`: la diferencia dice si te estaba apuntando. Comprobado
 * contra datos reales: en una kill cualquiera del archivo el rumbo del asesino
 * coincide con la dirección a su víctima con 4 decimales.
 */
export function angleDiffDeg(aDeg: number, bDeg: number): number {
  let d = (aDeg - bDeg) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/** Callout más cercano a un punto del mundo, o null si el mapa no trae zonas. */
export function nearestCallout(
  callouts: MapCallout[] | undefined,
  x: number,
  y: number,
): MapCallout | null {
  let best: MapCallout | null = null;
  let bestD = Infinity;
  for (const c of callouts ?? []) {
    const d = dist2d({ x, y }, c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** «A Main», «Mid Courtyard»… evitando repetir la zona padre. */
export function calloutLabel(c: MapCallout | null): { zone: string | null; area: string | null } {
  if (!c) return { zone: null, area: null };
  const area = c.area || null;
  const zone = area && !c.name.toLowerCase().startsWith(area.toLowerCase()) ? `${area} ${c.name}` : c.name;
  return { zone, area };
}

export interface DeathMatchInput {
  matchId: string;
  match: HenrikMatch;
  startedAt: number;
}

/** Las partidas de UNA cuenta del perfil (un perfil puede tener varias). */
export interface DeathTarget {
  puuid: string;
  matches: DeathMatchInput[];
}

export async function buildDeathReport(
  targets: DeathTarget[],
  player: string,
  range: { from: string; to: string },
): Promise<DeathReport> {
  const dicts = await getContent();
  const weaponDicts = weaponDictsFrom(dicts);
  const spots: DeathSpot[] = [];
  let rounds = 0;
  let aliveSamples = 0;
  let aliveAlone = 0;
  const matchIds = new Set<string>();
  const roundsByMap = new Map<string, number>();

  for (const target of targets) {
    const { puuid, matches } = target;
    for (const { matchId, match, startedAt } of matches) {
      matchIds.add(matchId);
      const me = (match.players ?? []).find((p) => p.puuid === puuid);
      if (!me) continue;
      const myTeam = me.team_id ?? null;
      const mapName = match.metadata?.map?.name ?? '?';
      const mapInfo = await getMapInfo(match.metadata?.map?.id);
      const callouts = mapInfo?.callouts ?? [];
      const ctx = weaponContext(match, weaponDicts);
      const sides = myTeam ? sidesByRound(match, myTeam) : new Map<number, 0 | 1>();

      const allRounds = match.rounds ?? [];
      rounds += allRounds.length;
      roundsByMap.set(mapName, (roundsByMap.get(mapName) ?? 0) + allRounds.length);

      for (const r of allRounds) {
        const id = r.id ?? 0;
        const roundKills = (match.kills ?? [])
          .filter((k) => k.round === id)
          .sort((a, b) => (a.time_in_round_in_ms ?? 0) - (b.time_in_round_in_ms ?? 0));
        const firstKill = roundKills[0] ?? null;

        // Economía de la ronda: mi loadout y el del asesino.
        const loadoutByPuuid = new Map<string, number>();
        for (const s of r.stats ?? []) {
          const p = s.player?.puuid;
          if (p) loadoutByPuuid.set(p, typeof s.economy?.loadout_value === 'number' ? s.economy.loadout_value : 0);
        }

        const plant = r.plant ?? null;
        const plantT = plant?.round_time_in_ms ?? null;
        const spike: 'mine' | 'theirs' | null =
          plant && typeof plantT === 'number'
            ? plant.player?.team === myTeam
              ? 'mine'
              : 'theirs'
            : null;

        for (const k of roundKills) {
          // Muestra de comparación: en las kills en las que YO seguía vivo, a
          // qué distancia estaba mi compañero más cercano. Es el mismo cálculo
          // que en mis muertes, así que los dos porcentajes son comparables.
          if (k.victim?.puuid !== puuid) {
            const mine = (k.player_locations ?? []).find((pl) => pl.player?.puuid === puuid)?.location;
            if (mine && typeof mine.x === 'number' && typeof mine.y === 'number') {
              aliveSamples += 1;
              let nearest = Infinity;
              for (const pl of k.player_locations ?? []) {
                if (pl.player?.puuid === puuid || pl.player?.team !== myTeam) continue;
                const p = pl.location ?? {};
                if (typeof p.x !== 'number' || typeof p.y !== 'number') continue;
                nearest = Math.min(nearest, dist2d({ x: mine.x, y: mine.y }, { x: p.x, y: p.y }));
              }
              if (nearest > NEAR) aliveAlone += 1;
            }
            continue;
          }
          const loc = k.location ?? {};
          if (typeof loc.x !== 'number' || typeof loc.y !== 'number') continue;
          const t = k.time_in_round_in_ms ?? 0;
          const killerPuuid = k.killer?.puuid;
          const killerLoc = (k.player_locations ?? []).find((pl) => pl.player?.puuid === killerPuuid)?.location;

          // Cerca: compañeros y rivales vivos en ese instante (la víctima no está).
          let matesNear = 0;
          let enemiesNear = 0;
          for (const pl of k.player_locations ?? []) {
            const p = pl.location ?? {};
            if (typeof p.x !== 'number' || typeof p.y !== 'number') continue;
            if (pl.player?.puuid === puuid) continue;
            const d = dist2d({ x: loc.x, y: loc.y }, { x: p.x, y: p.y });
            if (d > NEAR) continue;
            if (pl.player?.team === myTeam) matesNear += 1;
            else if (pl.player?.team) enemiesNear += 1;
          }

          // Trade: un compañero mata a mi asesino poco después, en la misma ronda.
          const traded = roundKills.some(
            (o) =>
              (o.time_in_round_in_ms ?? 0) > t &&
              (o.time_in_round_in_ms ?? 0) - t <= TRADE_MS &&
              o.victim?.puuid === killerPuuid &&
              o.killer?.team === myTeam,
          );

          // ¿Me apuntaba? Su vista (radianes de mundo) contra el rumbo a mi cadáver.
          let facing: boolean | null = null;
          if (killerLoc && typeof killerLoc.x === 'number' && typeof killerLoc.y === 'number') {
            const killerView = (k.player_locations ?? []).find((pl) => pl.player?.puuid === killerPuuid);
            if (typeof killerView?.view_radians === 'number') {
              const toMe = (Math.atan2(loc.y - killerLoc.y, loc.x - killerLoc.x) * 180) / Math.PI;
              const view = (killerView.view_radians * 180) / Math.PI;
              facing = Math.abs(angleDiffDeg(view, toMe)) <= FACING_DEG;
            }
          }

          const dist =
            killerLoc && typeof killerLoc.x === 'number' && typeof killerLoc.y === 'number'
              ? Math.round(dist2d({ x: loc.x, y: loc.y }, { x: killerLoc.x, y: killerLoc.y }))
              : -1;
          const w = resolveWeaponIn(ctx, k);
          const myLoadout = loadoutByPuuid.get(puuid) ?? 0;
          const killerLoadout = killerPuuid ? (loadoutByPuuid.get(killerPuuid) ?? 0) : 0;
          const opening = firstKill === k;
          const callout = nearestCallout(callouts, loc.x, loc.y);
          const { zone, area } = calloutLabel(callout);

          const tags: string[] = [];
          if (opening) tags.push('apertura');
          if (matesNear === 0) tags.push('solo');
          if (!traded) tags.push('sin-trade');
          if (enemiesNear >= 2 && enemiesNear > matesNear) tags.push('rodeado');
          if (w.kind === 'ability') tags.push('habilidad');
          if (dist >= LONG_RANGE) tags.push('a-distancia');
          if (dist >= 0 && dist <= SHORT_RANGE) tags.push('cuerpo-a-cuerpo');
          if (facing === false) tags.push('de-espaldas');
          if (spike === 'mine' && typeof plantT === 'number' && t > plantT) tags.push('post-plant');
          if (killerLoadout > 0 && myLoadout < killerLoadout * ECO_RATIO) tags.push('eco-desfavorable');

          spots.push({
            matchId,
            startedAt,
            map: mapName,
            agent: me.agent?.name ?? '?',
            round: id + 1,
            t,
            side: sides.get(id) === 1 ? 'atk' : sides.get(id) === 0 ? 'def' : null,
            zone,
            area,
            x: loc.x,
            y: loc.y,
            killer: k.killer?.name ?? '?',
            killerAgent: killerPuuid ? (ctx.agentByPuuid.get(killerPuuid) ?? null) : null,
            weapon: w.name,
            weaponKind: w.kind,
            dist,
            facing,
            opening,
            matesNear,
            enemiesNear,
            traded,
            spike,
            myLoadout,
            killerLoadout,
            tags,
          });
        }
      }
    }
  }

  // Las filas van de lo más reciente a lo más viejo y con tope: el informe de un
  // día son ~40 muertes, pero una ventana de un mes serían miles de filas y lo
  // que se lee son los agregados. `deaths` siempre trae el total real.
  const ordered = [...spots].sort((a, b) => b.startedAt - a.startedAt || b.round - a.round);
  const aloneDeaths = spots.filter((s) => s.matesNear === 0).length;

  return {
    player,
    from: range.from,
    to: range.to,
    matches: matchIds.size,
    rounds,
    deaths: spots.length,
    baseline: {
      aliveSamples,
      aloneAlivePct: aliveSamples ? Math.round((aliveAlone / aliveSamples) * 100) : 0,
      aloneDeathPct: spots.length ? Math.round((aloneDeaths / spots.length) * 100) : 0,
    },
    spots: ordered.slice(0, SPOTS_LIMIT),
    ...aggregate(spots, roundsByMap),
  };
}

function aggregate(spots: DeathSpot[], roundsByMap: Map<string, number>) {
  const zoneMap = new Map<string, { map: string; zone: string; area: string | null; deaths: number; openings: number; alone: number }>();
  const mapMap = new Map<string, { map: string; rounds: number; deaths: number; openings: number; alone: number; traded: number }>();
  const sideMap = new Map<'atk' | 'def', { deaths: number; openings: number }>();
  const weaponMap = new Map<string, { weapon: string; kind: WeaponKind; deaths: number }>();
  const killerMap = new Map<string, { killer: string; agent: string | null; weapon: string; times: number }>();
  const tagCount = new Map<string, number>();

  // Los mapas jugados entran aunque no muriera en ellos: si no, el % de muertes
  // por ronda de un mapa donde morí poco saldría inflado.
  for (const [map, rounds] of roundsByMap) {
    mapMap.set(map, { map, rounds, deaths: 0, openings: 0, alone: 0, traded: 0 });
  }

  for (const s of spots) {
    const zKey = `${s.map}|${s.zone ?? '?'}`;
    const z = zoneMap.get(zKey) ?? { map: s.map, zone: s.zone ?? '?', area: s.area, deaths: 0, openings: 0, alone: 0 };
    z.deaths += 1;
    if (s.opening) z.openings += 1;
    if (s.matesNear === 0) z.alone += 1;
    zoneMap.set(zKey, z);

    const m = mapMap.get(s.map);
    if (m) {
      m.deaths += 1;
      if (s.opening) m.openings += 1;
      if (s.matesNear === 0) m.alone += 1;
      if (s.traded) m.traded += 1;
    } else {
      mapMap.set(s.map, { map: s.map, rounds: 0, deaths: 1, openings: s.opening ? 1 : 0, alone: s.matesNear === 0 ? 1 : 0, traded: s.traded ? 1 : 0 });
    }

    if (s.side) {
      const sd = sideMap.get(s.side) ?? { deaths: 0, openings: 0 };
      sd.deaths += 1;
      if (s.opening) sd.openings += 1;
      sideMap.set(s.side, sd);
    }

    const w = weaponMap.get(s.weapon) ?? { weapon: s.weapon, kind: s.weaponKind, deaths: 0 };
    w.deaths += 1;
    weaponMap.set(s.weapon, w);

    const kKey = `${s.killer}|${s.weapon}`;
    const kc = killerMap.get(kKey) ?? { killer: s.killer, agent: s.killerAgent, weapon: s.weapon, times: 0 };
    kc.times += 1;
    killerMap.set(kKey, kc);

    for (const t of s.tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
  }

  const total = Math.max(1, spots.length);
  return {
    zones: [...zoneMap.values()].sort((a, b) => b.deaths - a.deaths || a.zone.localeCompare(b.zone)),
    maps: [...mapMap.values()].sort((a, b) => b.deaths - a.deaths),
    sides: [...sideMap.entries()]
      .map(([side, v]) => ({ side, ...v }))
      .sort((a, b) => b.deaths - a.deaths),
    weapons: [...weaponMap.values()].sort((a, b) => b.deaths - a.deaths || a.weapon.localeCompare(b.weapon)),
    killers: [...killerMap.values()].sort((a, b) => b.times - a.times).slice(0, 12),
    signals: [...tagCount.entries()]
      .map(([tag, count]) => ({ tag, count, pct: Math.round((count / total) * 100) }))
      .sort((a, b) => b.count - a.count),
  };
}
