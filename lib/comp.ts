import type { MatchRow } from './types';
import { agentRole } from './roles';
import { metaPickOf, ROTATION_MAPS } from './proneta';

/**
 * Regla de datos: el WR que manda es **agente jugado en ese mapa** (1+ partida
 * basta; la muestra pequeña se encoge en el score). El WR global del agente
 * solo se usa como respaldo marcado como "global", y nunca para elegir a un
 * agente que el jugador no ha usado en el mapa.
 */
export const MIN_MAP_GAMES = 1;
export const MIN_AGENT_GAMES = 1;
/** Máximo de candidatos por jugador (producto 4 × 8 ≈ 4,1k combos por mapa). */
const MAX_CANDIDATES = 8;
/** Pick pro ≥ 20% = meta fuerte del mapa; ≥ 10% = viable. */
export const META_STRONG = 20;
export const META_MIN = 10;

export interface AgentPick {
  agent: string;
  agentIcon: string | null;
  role: string | null;
  games: number;
  wins: number;
  wr: number;
  kd: number;
  /** De dónde sale el WR mostrado: mapa concreto / global agente / (sin muestra) */
  source: 'map' | 'agent' | 'player';
  /** % de uso pro en el mapa (0 = no se juega en la meta) */
  metaPick: number;
  /** WR "evaluable" para el ranking, con muestra pequeña encogida hacia 50% */
  score: number;
}

export interface CompEntry {
  label: string;
  color: string;
  pick: AgentPick;
  /** Mejores alternativas del jugador sin romper la composición */
  backups: AgentPick[];
}

export interface CompCard {
  map: string;
  mapIcon: string | null;
  teamGames: number;
  teamWins: number;
  teamWr: number;
  entries: CompEntry[];
  /** WR esperado de la comp (promedio de los evalWr de cada jugador) */
  score: number;
}

export interface CompTeam {
  id: string;
  label: string;
  color: string;
  /** Roles declarados del jugador en lib/team.ts (p. ej. "Duelist/Sentinel") */
  role?: string;
  /** Preferencias manuales agente por mapa (lib/team.ts) */
  prefs?: { map: string; agents: string[] }[];
  matches: MatchRow[];
}

/** Media-vida del peso temporal: las partidas recientes pesan mucho más.
 *  w(match) = exp(-edadDias / 90). A los ~90 días el peso cae a la mitad. */
const RECENT_HALF_LIFE_DAYS = 90;

interface Acc {
  /** recuento real (para mostrar "12p") */
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  /** recuento con descuento temporal (para WR/score) */
  wGames: number;
  wWins: number;
  wKills: number;
  wDeaths: number;
}

const newAcc = (): Acc => ({ games: 0, wins: 0, kills: 0, deaths: 0, wGames: 0, wWins: 0, wKills: 0, wDeaths: 0 });

/** Encoge WR de muestras pequeñas hacia 50% (100% con 2p ≈ 80%, 50% con 0p...). */
function shrunken(wr: number, games: number): number {
  if (games <= 0) return 0;
  const k = games / (games + 3);
  return wr * k + 50 * (1 - k);
}

interface PlayerModel {
  label: string;
  color: string;
  rolesPref: Set<string>;
  prefAgents: Map<string, Set<string>>;
  mapAgent: Map<string, Acc>;
  agent: Map<string, Acc>;
  all: Acc;
}

interface RoleInfo {
  role: string | null;
  icon: string | null;
}

function buildPlayer(team: CompTeam): PlayerModel {
  const mapAgent = new Map<string, Acc>();
  const agent = new Map<string, Acc>();
  const all = newAcc();
  const rolesPref = new Set((team.role ?? '').split('/').map((s) => s.trim()).filter(Boolean));
  const prefAgents = new Map<string, Set<string>>();
  for (const p of team.prefs ?? []) {
    prefAgents.set(p.map, new Set(p.agents));
  }
  const now = Date.now();
  const add = (a: Acc, m: MatchRow) => {
    const ageDays = Math.max(0, (now - m.timestamp) / 86_400_000);
    const w = Math.exp(-ageDays / RECENT_HALF_LIFE_DAYS);
    a.games += 1;
    if (m.won) a.wins += 1;
    a.kills += m.kills;
    a.deaths += m.deaths;
    a.wGames += w;
    if (m.won) a.wWins += w;
    a.wKills += m.kills * w;
    a.wDeaths += m.deaths * w;
  };
  for (const m of team.matches) {
    const key = `${m.map}::${m.agent}`;
    let a = mapAgent.get(key);
    if (!a) {
      a = newAcc();
      mapAgent.set(key, a);
    }
    add(a, m);

    let ag = agent.get(m.agent);
    if (!ag) {
      ag = newAcc();
      agent.set(m.agent, ag);
    }
    add(ag, m);
    add(all, m);
  }
  return { label: team.label, color: team.color, rolesPref, prefAgents, mapAgent, agent, all };
}

/**
 * "Dueño" de cada agente: el jugador con más volumen (ponderado por fecha) en
 * ese agente del equipo. Ej.: si Juan es quien más juega Sova, el bonus de
 * propiedad le asegura el pick cuando el equipo necesita un Sova.
 */
export function agentOwners(models: PlayerModel[], agents: string[]): Map<string, { player: PlayerModel; wGames: number }> {
  const owners = new Map<string, { player: PlayerModel; wGames: number }>();
  for (const agent of agents) {
    let best: { player: PlayerModel; wGames: number } | null = null;
    for (const p of models) {
      const acc = p.agent.get(agent);
      if (!acc || acc.wGames < 2) continue;
      if (!best || acc.wGames > best.wGames) best = { player: p, wGames: acc.wGames };
    }
    if (best) owners.set(agent, best);
  }
  return owners;
}

function roleOf(agent: string, roles: Map<string, RoleInfo>): string | null {
  return roles.get(agent)?.role ?? agentRole(agent) ?? null;
}

function makePick(player: PlayerModel, agent: string, map: string, roles: Map<string, RoleInfo>, owners: Map<string, { player: PlayerModel; wGames: number }>): AgentPick {
  const mapAcc = player.mapAgent.get(`${map}::${agent}`);
  const agentAcc = player.agent.get(agent);
  const metaPick = metaPickOf(map, agent);
  const hasMap = mapAcc != null && mapAcc.games >= MIN_MAP_GAMES;
  const hasAgent = agentAcc != null && agentAcc.games >= MIN_AGENT_GAMES;

  // WR del mapa con respaldo: si en el mapa la muestra es chica (<3h efectivas),
  // se presta — al 35% — el WR del agente en el resto de mapas. Así una racha
  // de 2 partidas en el mapa no pisa un historial fuerte (Jett 90% en 11p) ni
  // una muestra chica de mapa domina por casualidad.
  const hasMapGames = (mapAcc?.games ?? 0) >= MIN_MAP_GAMES;
  const hasAgentGames = (agentAcc?.games ?? 0) >= MIN_AGENT_GAMES;
  const source: AgentPick['source'] = hasMapGames ? 'map' : hasAgentGames ? 'agent' : 'player';

  const mN = mapAcc?.wGames ?? 0;
  const mW = mapAcc?.wWins ?? 0;
  const eN = Math.max(0, (agentAcc?.wGames ?? 0) - mN);
  const eW = Math.max(0, (agentAcc?.wWins ?? 0) - mW);
  const BORROW = 0.35;
  const effN = mN + eN * BORROW;
  const effW = mW + eW * BORROW;
  // Sin datos del agente en absoluto: WR global del jugador contado como 1 sola
  // muestra (50% + 25%·WR) — un agente que nunca jugó no cobra la racha global.
  const evalWr = effN > 0 ? (effW / effN) * 100 : player.all.wGames > 0 ? (player.all.wWins / player.all.wGames) * 100 : 0;
  const evalN = effN > 0 ? effN : player.all.wGames > 0 ? 1 : 0;

  const shownGames = hasMapGames ? (mapAcc?.games ?? 0) : agentAcc?.games ?? 0;
  const shownWins = hasMapGames ? (mapAcc?.wins ?? 0) : agentAcc?.wins ?? 0;
  const kdSrc = mapAcc ?? agentAcc;
  const shown = {
    games: shownGames,
    wins: shownWins,
    wr: effN > 0 ? evalWr : 0,
    kd: kdSrc && kdSrc.wDeaths > 0 ? kdSrc.wKills / kdSrc.wDeaths : kdSrc && kdSrc.deaths ? kdSrc.kills / kdSrc.deaths : 0,
  };

  // Fuera de la meta pro: penalización suave. Excepción: pick local probado
  // (≥5p y ≥55% en el mapa) — es un "signature" viable aunque pro no lo juegue.
  const localSignature =
    mapAcc != null && mapAcc.games >= 5 && mapAcc.wGames > 0 && (mapAcc.wWins / mapAcc.wGames) >= 0.55;
  const offMeta = metaPick < META_MIN ? (localSignature ? -6 : -12) : 0;
  // Agente sin ninguna partida (ni en mapa ni global): solo sujeto de relleno.
  const fillerPenalty = source === 'player' ? -5 : 0;
  // Propiedad: quien más juega el agente del equipo lo conserva (ej. mejor Sova).
  const own = owners.get(agent);
  const ownBonus = own != null && own.player === player ? 8 : 0;
  // Preferencia manual del jugador en este mapa (gana sobre el score automático).
  const prefBonus = player.prefAgents.get(map)?.has(agent) ? 14 : 0;
  const score = shrunken(evalWr, evalN) + metaPick * 0.15 + offMeta + fillerPenalty + ownBonus + prefBonus;

  return {
    agent,
    agentIcon: roles.get(agent)?.icon ?? null,
    role: roleOf(agent, roles),
    games: shown.games,
    wins: shown.wins,
    wr: shown.wr,
    kd: shown.kd,
    source,
    metaPick,
    score,
  };
}

function candidatesFor(
  player: PlayerModel,
  map: string,
  allAgents: string[],
  roles: Map<string, RoleInfo>,
  owners: Map<string, { player: PlayerModel; wGames: number }>,
  roleFilter?: string,
): AgentPick[] {
  const seen = new Set<string>();
  const picks: AgentPick[] = [];
  const push = (agent: string) => {
    if (seen.has(agent) || !agent) return;
    seen.add(agent);
    const p = makePick(player, agent, map, roles, owners);
    if (roleFilter && p.role !== roleFilter) return;
    picks.push(p);
  };

  for (const k of player.mapAgent.keys()) {
    const agent = k.split('::')[1];
    if (agent) push(agent);
  }
  for (const a of player.agent.keys()) push(a);
  for (const a of allAgents) push(a);

  return picks
    .sort((a, b) => b.score - a.score || b.metaPick - a.metaPick || b.games - a.games)
    .slice(0, MAX_CANDIDATES);
}

/**
 * Reparto rol primero: los 4 roles (Duelist/Controller/Sentinel/Initiator) se
 * asignan a los 4 jugadores maximizando score — con bonus fuerte al rol
 * declarado del perfil y castigo a salirse de él. Así Alex se queda de
 * duelista, NoMicr de sentinel, Gengar de controller y Juan de iniciador
 * cuando los datos lo soportan; dentro del rol, elige el mejor agente.
 */
const ROLES = ['Duelist', 'Controller', 'Sentinel', 'Initiator'] as const;
const IN_ROLE_BONUS = 6;
const OUT_ROLE_PENALTY = -10;

function assignRoles(
  models: PlayerModel[],
  map: string,
  allAgents: string[],
  roles: Map<string, RoleInfo>,
  owners: Map<string, { player: PlayerModel; wGames: number }>,
): { pools: AgentPick[][]; roleOf: (string | undefined)[] } | null {
  // Mejor pick de cada jugador en cada rol.
  const best: (AgentPick | null)[][] = models.map(() => ROLES.map(() => null));
  for (let i = 0; i < models.length; i++) {
    const cands = candidatesFor(models[i], map, allAgents, roles, owners);
    for (let r = 0; r < ROLES.length; r++) {
      const inRole = cands.find((c) => c.role === ROLES[r]);
      if (inRole) best[i][r] = inRole;
    }
  }
  if (best.some((row) => row.every((x) => x == null))) return null;

  // Preferencias manuales: si el jugador prefiere agentes de UN solo rol en
  // este mapa, ese rol queda bloqueado para él (p. ej. Alex: Chamber en
  // Sunset/Haven → siempre sentinel). Con prefs de varios roles (Sage/Raze/
  // Jett en Split) se queda flexible, solo con bonus.
  const forced: (number | null)[] = models.map((p, i) => {
    const prefs = p.prefAgents.get(map);
    if (!prefs || prefs.size === 0) return null;
    const roleSet = new Set<string>();
    for (const a of prefs) {
      const r = roleOf(a, roles);
      if (r) roleSet.add(r);
    }
    if (roleSet.size !== 1) return null;
    const idx = ROLES.indexOf([...roleSet][0] as (typeof ROLES)[number]);
    return idx >= 0 && best[i][idx] != null ? idx : null;
  });

  let bestPerm: number[] | null = null;
  let bestScore = -Infinity;
  const perm = [0, 1, 2, 3];
  const tryPerm = (p: number[], fixed: number) => {
    if (fixed === p.length) {
      let s = 0;
      for (let i = 0; i < p.length; i++) {
        if (forced[i] != null && p[i] !== forced[i]) return;
        const pick = best[i][p[i]];
        if (!pick) return;
        const role = p[i];
        const pref = models[i].rolesPref.has(ROLES[role]);
        s += pick.score + (pref ? IN_ROLE_BONUS : OUT_ROLE_PENALTY);
      }
      if (s > bestScore) {
        bestScore = s;
        bestPerm = [...p];
      }
      return;
    }
    for (let j = fixed; j < p.length; j++) {
      [p[fixed], p[j]] = [p[j], p[fixed]];
      tryPerm(p, fixed + 1);
      [p[fixed], p[j]] = [p[j], p[fixed]];
    }
  };
  tryPerm(perm, 0);
  if (!bestPerm) return null;

  const pools: AgentPick[][] = [];
  const assignedRole: (string | undefined)[] = [];
  for (let i = 0; i < models.length; i++) {
    const role = ROLES[bestPerm[i]];
    assignedRole.push(role);
    const cands = candidatesFor(models[i], map, allAgents, roles, owners, role);
    pools.push(cands.length ? cands : [best[i][bestPerm[i]]!]);
  }
  return { pools, roleOf: assignedRole };
}

/**
 * Reglas de composición:
 *  - El mismo agente no puede repetirse (dos Omen no juegan juntos).
 *  - Máx 2 jugadores por rol; si un rol tiene 2, ningún otro puede duplicar.
 */
export function compOk(picks: AgentPick[]): boolean {
  const agents = new Set<string>();
  const counts = new Map<string, number>();
  for (const p of picks) {
    if (agents.has(p.agent)) return false;
    agents.add(p.agent);
    const r = p.role ?? 'Flex';
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  for (const c of counts.values()) if (c > 2) return false;
  let doubled = 0;
  for (const c of counts.values()) if (c === 2) doubled += 1;
  return doubled <= 1;
}

function comboScore(picks: AgentPick[]): { score: number; mapHits: number } {
  const counts = new Map<string, number>();
  for (const p of picks) {
    const r = p.role ?? 'Flex';
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  const distinct = counts.size === picks.length;
  const shapeBonus = distinct ? 3 : 0;
  return {
    score: picks.reduce((s, p) => s + p.score, 0) + shapeBonus,
    mapHits: picks.filter((p) => p.source === 'map').length,
  };
}

function search(pools: AgentPick[][]): AgentPick[] | null {
  let best: AgentPick[] | null = null;
  let bestScore = -Infinity;
  let bestMapHits = -1;
  const n = pools.length;
  if (n === 0) return null;
  const idx = pools.map(() => 0);
  loop: while (true) {
    const combo: AgentPick[] = [];
    for (let i = 0; i < n; i++) combo.push(pools[i][idx[i]]);
    if (compOk(combo)) {
      const { score, mapHits } = comboScore(combo);
      if (score > bestScore || (score === bestScore && mapHits > bestMapHits)) {
        bestScore = score;
        bestMapHits = mapHits;
        best = combo;
      }
    }
    let k = n - 1;
    while (k >= 0) {
      idx[k] += 1;
      if (idx[k] < pools[k].length) continue loop;
      idx[k] = 0;
      k -= 1;
    }
    break;
  }
  return best;
}

export function buildCompCards(team: CompTeam[], allMatches: MatchRow[]): CompCard[] {
  const models = team.map(buildPlayer);
  const roles = new Map<string, RoleInfo>();
  for (const m of allMatches) {
    if (!roles.has(m.agent)) {
      roles.set(m.agent, { role: m.agentRole ?? agentRole(m.agent), icon: m.agentIcon ?? null });
    }
  }
  const allAgents = [...roles.keys()];
  const owners = agentOwners(models, allAgents);

  const maps = new Set<string>();
  for (const m of allMatches) maps.add(m.map);

  const seenMatch = new Set<string>();
  const mapStats = new Map<string, { games: number; wins: number }>();
  for (const m of allMatches) {
    const id = m.matchId;
    if (id) {
      if (seenMatch.has(id)) continue;
      seenMatch.add(id);
    }
    const s = mapStats.get(m.map) ?? { games: 0, wins: 0 };
    s.games += 1;
    if (m.won) s.wins += 1;
    mapStats.set(m.map, s);
  }

  const cards: CompCard[] = [];
  for (const map of maps) {
    if (!ROTATION_MAPS.includes(map)) continue;
    // Rol primero (1/1/1/1) vs búsqueda libre (permite flex con las reglas
    // de comp): gana la que mejor score suma — el reparto por roles no puede
    // forzar un relleno de 0 partidas si la búsqueda libre tiene algo mejor.
    const freePools = models.map((p) => candidatesFor(p, map, allAgents, roles, owners));
    const freeBest = search(freePools);
    const freeSum = freeBest ? comboScore(freeBest).score : -Infinity;
    let pools = freePools;
    let best = freeBest;
    const assign = assignRoles(models, map, allAgents, roles, owners);
    if (assign) {
      const assignSum = assign.pools.reduce((s, p) => s + p[0].score, 0) + 3;
      if (assignSum >= freeSum) {
        pools = assign.pools;
        best = assign.pools.map((p) => p[0]);
      }
    }
    const ms = mapStats.get(map) ?? { games: 0, wins: 0 };
    const entries: CompEntry[] = [];
    if (best) {
      for (let i = 0; i < best.length; i++) {
        const main = best[i];
        const backups: AgentPick[] = [];
        for (const alt of pools[i]) {
          if (alt.agent === main.agent) continue;
          const combo = best.map((p2, j) => (j === i ? alt : p2));
          if (!compOk(combo)) continue;
          backups.push(alt);
        }
        backups.sort((a, b) => b.score - a.score || b.metaPick - a.metaPick);
        entries.push({ label: models[i].label, color: models[i].color, pick: main, backups: backups.slice(0, 2) });
      }
    }
    const score = entries.length ? entries.reduce((s, e) => s + e.pick.score, 0) / entries.length : 0;
    cards.push({
      map,
      mapIcon: mapIconOf(map, allMatches),
      teamGames: ms.games,
      teamWins: ms.wins,
      teamWr: ms.games ? (ms.wins / ms.games) * 100 : 0,
      entries,
      score,
    });
  }

  cards.sort((a, b) => b.teamGames - a.teamGames || b.teamWr - a.teamWr);
  return cards;
}

function mapIconOf(map: string, allMatches: MatchRow[]): string | null {
  for (const m of allMatches) if (m.map === map && m.mapIcon) return m.mapIcon;
  return null;
}
