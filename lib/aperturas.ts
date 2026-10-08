import {
  henrikMatchTimestamp,
  type HenrikKill,
  type HenrikMatch,
  type HenrikMatchPlayer,
  type HenrikMatchRound,
} from './henrik';
import type {
  AperturaBucket,
  AperturaGrupo,
  AperturaPartida,
  AperturaVerificacion,
  ValAperturas,
} from './types';

/**
 * Aperturas por ronda desde el kill feed ya cacheado ($0 requests).
 *
 * Por cada ronda se marca:
 *  - FD: fue mi primera muerte del round (morí primero).
 *  - FB: fue mi primera sangre del round (primer kill).
 *  - Bando: inferido de las plantas del round (quién plantó) + mitades 0-11 /
 *    12-23 y alternancia en OT (mismo criterio que
 *    `aim-tracker/scripts/round-fd-stats.mjs`).
 *
 * Los promedios por 100 rondas (para comparar volúmenes distintos) se derivan
 * en la UI: aquí solo se cuentan rondas y resultados.
 */

function emptyBucket(): AperturaBucket {
  return { rounds: 0, fd: 0, fdWon: 0, noFd: 0, noFdWon: 0, fb: 0, fbWon: 0, fbLost: 0 };
}

function registerRound(b: AperturaBucket, won: boolean, fd: boolean, fb: boolean): void {
  b.rounds += 1;
  if (fd) {
    b.fd += 1;
    if (won) b.fdWon += 1;
  } else {
    b.noFd += 1;
    if (won) b.noFdWon += 1;
  }
  if (fb) {
    b.fb += 1;
    if (won) b.fbWon += 1;
    else b.fbLost += 1;
  }
}

function grupoOf(map: Map<string, AperturaGrupo>, name: string): AperturaGrupo {
  let g = map.get(name);
  if (!g) {
    g = { name, total: emptyBucket(), atk: emptyBucket(), def: emptyBucket(), atkMatches: 0, defMatches: 0 };
    map.set(name, g);
  }
  return g;
}

/** Mi equipo ("Blue"/"Red"): players[].team_id y, si falta, el kill feed. */
function myTeamOf(m: HenrikMatch, me: HenrikMatchPlayer | undefined, puuid: string): string | null {
  if (me?.team_id) return me.team_id;
  for (const k of m.kills ?? []) {
    if (k.killer?.puuid === puuid && k.killer.team) return k.killer.team;
    if (k.victim?.puuid === puuid && k.victim.team) return k.victim.team;
  }
  return null;
}

/** Ronda con el id real del payload (fallback: posición en el array). */
function roundIdOf(r: { id?: number }, idx: number): number {
  return typeof r.id === 'number' ? r.id : idx;
}

/**
 * Bando de MI equipo en la ronda según el dato OFICIAL de Riot (match v4
 * desde v4.10): `winning_team` + `winning_team_role` describen el bando del
 * equipo ganador, así que si ganó el rival el mío es el contrario.
 * Devuelve null si la API no publicó el rol (partidas antiguas).
 */
function sideFromOfficial(r: HenrikMatchRound, myTeam: string): 0 | 1 | null {
  const role = (r.winning_team_role ?? '').toLowerCase();
  if (!r.winning_team || !role) return null;
  // Riot publica "Attacker" / "Defender" (ojo: el prefijo es "att", no "atk").
  const winnerSide: 0 | 1 | null = role.startsWith('att') ? 1 : role.startsWith('def') ? 0 : null;
  if (winnerSide == null) return null;
  return r.winning_team === myTeam ? winnerSide : ((winnerSide ^ 1) as 0 | 1);
}

export interface MatchSides {
  side: Map<number, 0 | 1>;
  /** Rondas cuyo bando viene del dato oficial (no inferido). */
  official: Set<number>;
}

/**
 * Bando por ronda: 1 = ATK (mi equipo ataca), 0 = DEF, ausente = sin determinar.
 * Prioridad de fuentes:
 *  1. **Oficial** (`winning_team_role`, v4.10): exacto, ronda a ronda.
 *  2. Plantas: revelan el bando de su ronda (criterio histórico).
 *  3. Mitades completas (la 1.ª y la 2.ª son bandos opuestos) y OT alterna,
 *     solo para las rondas que siguen sin dato.
 */
export function sidesByRoundDetailed(m: HenrikMatch, myTeam: string): MatchSides {
  const official = new Set<number>();
  const known = new Map<number, 0 | 1>();
  for (const [idx, r] of (m.rounds ?? []).entries()) {
    const side = sideFromOfficial(r, myTeam);
    if (side == null) continue;
    const id = roundIdOf(r, idx);
    official.add(id);
    known.set(id, side);
  }
  for (const [idx, r] of (m.rounds ?? []).entries()) {
    const team = r.plant?.player?.team ?? null;
    if (team == null) continue;
    const id = roundIdOf(r, idx);
    // El dato oficial de esa ronda manda: no se pisa con la planta.
    if (known.has(id)) continue;
    known.set(id, team === myTeam ? 1 : 0);
  }

  const half = (base: number, end: number): 0 | 1 | null => {
    for (const [id, side] of known) {
      if (id >= base && id <= end) return side;
    }
    return null;
  };
  let first = half(0, 11);
  let second = half(12, 23);
  if (first == null && second != null) first = second === 1 ? 0 : 1;
  if (second == null && first != null) second = first === 1 ? 0 : 1;

  // Se parte de lo conocido (oficial + plantas) y solo se rellenan huecos.
  const side = new Map<number, 0 | 1>(known);
  if (first != null) for (let id = 0; id <= 11; id++) if (!side.has(id)) side.set(id, first);
  if (second != null) for (let id = 12; id <= 23; id++) if (!side.has(id)) side.set(id, second);

  const ids = (m.rounds ?? []).map((r, idx) => roundIdOf(r, idx));
  const maxId = ids.length ? Math.max(...ids) : -1;
  if (maxId >= 24) {
    let seed: 0 | 1 | null = second != null ? ((second ^ 1) as 0 | 1) : null;
    if (seed == null) {
      for (const [id, value] of known) {
        if (id >= 24) {
          seed = (value ^ ((id - 24) % 2)) as 0 | 1;
          break;
        }
      }
    }
    if (seed != null) {
      for (let id = 24; id <= maxId; id++) {
        if (!side.has(id)) side.set(id, (seed ^ ((id - 24) % 2)) as 0 | 1);
      }
    }
  }
  return { side, official };
}

/** Compat: solo el mapa de bandos (lo usan el detalle de partida y los tests). */
export function sidesByRound(m: HenrikMatch, myTeam: string): Map<number, 0 | 1> {
  return sidesByRoundDetailed(m, myTeam).side;
}

/** Primera kill de cada ronda: menor `time_in_round_in_ms` (fallback: orden del feed). */
function firstKillsByRound(m: HenrikMatch): Map<number, HenrikKill> {
  const out = new Map<number, { kill: HenrikKill; t: number; order: number }>();
  for (const [order, k] of (m.kills ?? []).entries()) {
    const id = typeof k.round === 'number' ? k.round : -1;
    const t = typeof k.time_in_round_in_ms === 'number' ? k.time_in_round_in_ms : Number.POSITIVE_INFINITY;
    const prev = out.get(id);
    if (!prev || t < prev.t || (t === prev.t && order < prev.order)) {
      out.set(id, { kill: k, t, order });
    }
  }
  const first = new Map<number, HenrikKill>();
  for (const [id, v] of out) first.set(id, v.kill);
  return first;
}

interface RoundFlags {
  won: boolean;
  fd: boolean;
  fb: boolean;
  side: 0 | 1 | null;
  /** Bando tomado del dato oficial y no inferido. */
  sideOfficial: boolean;
  /** La ronda trae first blood oficial de Riot (`rounds[].first_blood`). */
  fbOfficial: boolean;
  /** Hay dato oficial Y kill feed: se puede auditar la inferencia. */
  fbComparable: boolean;
  /** El killer oficial coincide con el inferido (solo si `fbComparable`). */
  fbAgrees: boolean;
}

/**
 * Flags por ronda. El FB sale del dato OFICIAL cuando existe (v4.10) y del
 * kill feed cuando no; la FD sigue saliendo del kill feed (Riot no publica la
 * víctima en `first_blood`), y cuando hay las dos fuentes se comparan para
 * auditar el motor.
 */
function roundsOf(m: HenrikMatch, puuid: string, myTeam: string): RoundFlags[] {
  const rounds = m.rounds ?? [];
  if (!rounds.length) return [];
  const sides = sidesByRoundDetailed(m, myTeam);
  const firstKills = firstKillsByRound(m);
  return rounds.map((r, idx) => {
    const id = roundIdOf(r, idx);
    // Sin `winning_team` (ronda corrupta o empate de ronda) no cuenta como ganada.
    const won = r.winning_team != null && r.winning_team === myTeam;
    const first = firstKills.get(id);
    const inferred = first?.killer?.puuid ?? null;
    const officialFb = r.first_blood?.puuid ?? null;
    const fb = officialFb != null ? officialFb === puuid : inferred === puuid;
    const fd = first?.victim?.puuid === puuid;
    const comparable = officialFb != null && inferred != null;
    return {
      won,
      fd,
      fb,
      side: sides.side.get(id) ?? null,
      sideOfficial: sides.official.has(id),
      fbOfficial: officialFb != null,
      fbComparable: comparable,
      fbAgrees: comparable && officialFb === inferred,
    };
  });
}

function emptyVerificacion(): AperturaVerificacion {
  return { rounds: 0, official: 0, agree: 0, mismatch: 0, sideOfficial: 0 };
}

function registerVerificacion(v: AperturaVerificacion, r: RoundFlags): void {
  v.rounds += 1;
  if (r.sideOfficial) v.sideOfficial += 1;
  if (!r.fbOfficial) return;
  v.official += 1;
  if (!r.fbComparable) return;
  if (r.fbAgrees) v.agree += 1;
  else v.mismatch += 1;
}

/** FB/FD por bando de una partida (detalle): buckets con el mismo criterio que el resumen. */
export interface MatchAperturas {
  /** Rondas de la partida (todas, tengan bando o no). */
  rounds: number;
  total: AperturaBucket;
  atk: AperturaBucket;
  def: AperturaBucket;
  /** Rondas sin bando inferible: no entran en ATK/DEF. */
  sinLado: number;
  /** Auditoría contra el first blood / bando oficial de Riot. */
  verificacion: AperturaVerificacion;
}

/** Calcula los buckets de una partida; `null` si no hay equipo o rondas utilizables. */
export function matchAperturas(m: HenrikMatch, puuid: string): MatchAperturas | null {
  const me = (m.players ?? []).find((p) => p.puuid === puuid);
  const myTeam = myTeamOf(m, me, puuid);
  if (!myTeam) return null;
  const rounds = roundsOf(m, puuid, myTeam);
  if (!rounds.length) return null;

  const total = emptyBucket();
  const atk = emptyBucket();
  const def = emptyBucket();
  const verificacion = emptyVerificacion();
  let sinLado = 0;
  for (const r of rounds) {
    registerRound(total, r.won, r.fd, r.fb);
    registerVerificacion(verificacion, r);
    if (r.side === 1) registerRound(atk, r.won, r.fd, r.fb);
    else if (r.side === 0) registerRound(def, r.won, r.fd, r.fb);
    else sinLado += 1;
  }
  return { rounds: rounds.length, total, atk, def, sinLado, verificacion };
}

/**
 * Agrega FB/FD por ronda de una lista de partidas (mismo orden que el resumen).
 * Devuelve `undefined` si ninguna partida tiene rondas utilizables.
 */
export function computeAperturas(matches: HenrikMatch[], puuid: string): ValAperturas | undefined {
  const total = emptyBucket();
  const atk = emptyBucket();
  const def = emptyBucket();
  const verificacion = emptyVerificacion();
  const byMap = new Map<string, AperturaGrupo>();
  const byAgent = new Map<string, AperturaGrupo>();
  const partidas: AperturaPartida[] = [];
  let sinLado = 0;
  let considered = 0;

  for (const m of matches) {
    const me = (m.players ?? []).find((p) => p.puuid === puuid);
    const myTeam = myTeamOf(m, me, puuid);
    if (!myTeam) continue;
    const rounds = roundsOf(m, puuid, myTeam);
    if (!rounds.length) continue;
    considered += 1;

    const map = m.metadata?.map?.name ?? '?';
    const agent = me?.agent?.name ?? '?';
    const myTeamRow =
      (m.teams ?? []).find((t) => t.team_id != null && t.team_id === myTeam) ?? (m.teams ?? [])[0];
    const partida: AperturaPartida = {
      matchId: m.metadata?.match_id ?? '',
      date: new Date(henrikMatchTimestamp(m)).toISOString(),
      map,
      agent,
      won: Boolean(myTeamRow?.won),
      rounds: rounds.length,
      fd: 0,
      fb: 0,
      fbLost: 0,
      sideUnknown: 0,
      fbOfficial: 0,
      sideOfficial: 0,
    };
    const gMap = grupoOf(byMap, map);
    const gAgent = grupoOf(byAgent, agent);
    let hasAtk = false;
    let hasDef = false;

    for (const r of rounds) {
      registerRound(total, r.won, r.fd, r.fb);
      registerRound(gMap.total, r.won, r.fd, r.fb);
      registerRound(gAgent.total, r.won, r.fd, r.fb);
      registerVerificacion(verificacion, r);
      if (r.fbOfficial) partida.fbOfficial = (partida.fbOfficial ?? 0) + 1;
      if (r.sideOfficial) partida.sideOfficial = (partida.sideOfficial ?? 0) + 1;
      if (r.side === 1) {
        hasAtk = true;
        registerRound(atk, r.won, r.fd, r.fb);
        registerRound(gMap.atk, r.won, r.fd, r.fb);
        registerRound(gAgent.atk, r.won, r.fd, r.fb);
      } else if (r.side === 0) {
        hasDef = true;
        registerRound(def, r.won, r.fd, r.fb);
        registerRound(gMap.def, r.won, r.fd, r.fb);
        registerRound(gAgent.def, r.won, r.fd, r.fb);
      } else {
        sinLado += 1;
        partida.sideUnknown += 1;
      }
      if (r.fd) partida.fd += 1;
      if (r.fb) {
        partida.fb += 1;
        if (!r.won) partida.fbLost += 1;
      }
    }
    // Denominadores del promedio de FD por partida en cada bando.
    if (hasAtk) {
      gMap.atkMatches += 1;
      gAgent.atkMatches += 1;
    }
    if (hasDef) {
      gMap.defMatches += 1;
      gAgent.defMatches += 1;
    }
    partidas.push(partida);
  }

  if (!considered) return undefined;

  const byRounds = (a: AperturaGrupo, b: AperturaGrupo): number =>
    b.total.rounds - a.total.rounds || a.name.localeCompare(b.name);

  return {
    total,
    atk,
    def,
    sinLado,
    byMap: [...byMap.values()].sort(byRounds),
    byAgent: [...byAgent.values()].sort(byRounds),
    matches: partidas.sort((a, b) => (a.date < b.date ? 1 : -1)),
    verificacion,
  };
}
