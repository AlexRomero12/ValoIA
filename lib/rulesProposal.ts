import { agentRole } from './roles';
import type { MatchRow } from './types';
import { poolRuleFor, type PoolRule, type SessionRules } from './profileTypes';

/**
 * Propuesta inicial de reglas de sesión a partir de las partidas ya cargadas
 * (30 días competitivos). Puro y determinista: sin red ni DOM, fácil de testear.
 *
 * Criterios conservadores por muestra (editables arriba): un mapa necesita 3
 * partidas para tener pool, un agente 2 para ser principal, y los prohibidos
 * exigen volumen mínimo para no castigar rachas cortas.
 */

export const PROPOSAL = {
  /** Partidas mínimas de un mapa para proponer pool. */
  mapMinGames: 3,
  /** Partidas mínimas de un agente para ser principal/backup. */
  agentMainMinGames: 2,
  /** WR mínimo (%) para ser principal del mapa. */
  agentMainMinWr: 50,
  /** Prohibir agente: mínimo de partidas y WR máximo (%). */
  agentBanMinGames: 3,
  agentBanMaxWr: 35,
  /** Prohibir rol: mínimo de partidas y WR máximo (%). */
  roleBanMinGames: 5,
  roleBanMaxWr: 45,
  goals: { wr: 55, kd: 1.05, acs: 220, hsPct: 25, adr: 150, fbPositive: true },
} as const;

export interface ProposalCandidate {
  name: string;
  wr: number;
  games: number;
}

export interface ProposalMapRule {
  map: string;
  main: ProposalCandidate[];
  backup: ProposalCandidate[];
}

export interface RulesProposal {
  rules: SessionRules;
  maps: ProposalMapRule[];
  bannedAgents: ProposalCandidate[];
  bannedRoles: ProposalCandidate[];
  /** Partidas analizadas (para el aviso de confianza). */
  matches: number;
}

interface Stat {
  games: number;
  decisive: number;
  wins: number;
}

function newStat(): Stat {
  return { games: 0, decisive: 0, wins: 0 };
}

function addStat(s: Stat, m: MatchRow): void {
  s.games += 1;
  const draw = m.roundsWon === m.roundsLost;
  if (draw) return;
  s.decisive += 1;
  if (m.won) s.wins += 1;
}

function wrOf(s: Stat): number {
  return s.decisive ? Math.round((s.wins / s.decisive) * 1000) / 10 : 0;
}

/** Construye la propuesta; `null` si no hay muestra suficiente (mín. 5 partidas). */
export function buildRulesProposal(matches: MatchRow[]): RulesProposal | null {
  const valid = matches.filter((m) => m.map && m.map !== '?' && m.agent && m.agent !== '?');
  if (valid.length < 5) return null;

  const mapGames = new Map<string, number>();
  const mapAgents = new Map<string, Map<string, Stat>>();
  const agents = new Map<string, Stat>();
  const roles = new Map<string, Stat>();

  for (const m of valid) {
    mapGames.set(m.map, (mapGames.get(m.map) ?? 0) + 1);
    const perAgent = mapAgents.get(m.map) ?? new Map<string, Stat>();
    const aStat = perAgent.get(m.agent) ?? newStat();
    addStat(aStat, m);
    perAgent.set(m.agent, aStat);
    mapAgents.set(m.map, perAgent);

    const aGlobal = agents.get(m.agent) ?? newStat();
    addStat(aGlobal, m);
    agents.set(m.agent, aGlobal);

    const role = m.agentRole ?? agentRole(m.agent);
    if (role) {
      const rStat = roles.get(role) ?? newStat();
      addStat(rStat, m);
      roles.set(role, rStat);
    }
  }

  const maps: ProposalMapRule[] = [];
  const byMap: Record<string, PoolRule> = {};
  for (const [map, perAgent] of mapAgents) {
    if ((mapGames.get(map) ?? 0) < PROPOSAL.mapMinGames) continue;
    const cands: ProposalCandidate[] = [...perAgent.entries()]
      .filter(([, s]) => s.games >= PROPOSAL.agentMainMinGames)
      .map(([name, s]) => ({ name, wr: wrOf(s), games: s.games }))
      .sort((a, b) => b.wr - a.wr || b.games - a.games);
    const main = cands.filter((c) => c.wr >= PROPOSAL.agentMainMinWr).slice(0, 1);
    if (!main.length) continue;
    const mainSet = new Set(main.map((c) => c.name));
    const backup = cands.filter((c) => !mainSet.has(c.name)).slice(0, 2);
    byMap[map] = { main: main.map((c) => c.name), backup: backup.map((c) => c.name) };
    maps.push({ map, main, backup });
  }

  const bannedAgents: ProposalCandidate[] = [...agents.entries()]
    .filter(([, s]) => s.games >= PROPOSAL.agentBanMinGames && wrOf(s) < PROPOSAL.agentBanMaxWr)
    .map(([name, s]) => ({ name, wr: wrOf(s), games: s.games }))
    .sort((a, b) => a.wr - b.wr);

  const bannedRoles: ProposalCandidate[] = [...roles.entries()]
    .filter(([, s]) => s.games >= PROPOSAL.roleBanMinGames && wrOf(s) < PROPOSAL.roleBanMaxWr)
    .map(([name, s]) => ({ name, wr: wrOf(s), games: s.games }))
    .sort((a, b) => a.wr - b.wr);

  const rules: SessionRules = {
    rulesVersion: 1,
    pool: { default: { main: [], backup: [] }, byMap },
    bannedAgents: bannedAgents.map((b) => b.name),
    bannedRoles: bannedRoles.map((b) => b.name),
    stop: { losses: 2, kdBelow: 0.9 },
    sessions: { gapMinutes: 180 },
    goals: { ...PROPOSAL.goals },
  };

  return { rules, maps, bannedAgents, bannedRoles, matches: valid.length };
}

function containsAll(list: string[], items: ProposalCandidate[]): boolean {
  const set = new Set(list);
  return items.every((c) => set.has(c.name));
}

export interface ProposalDiff {
  /** Mapas cuyo pool propuesto ya coincide con las reglas vigentes. */
  mapsApplied: string[];
  /** Mapas propuestos que aún no coinciden (aplicar los cambia). */
  mapsPending: ProposalMapRule[];
  bannedApplied: string[];
  bannedPending: ProposalCandidate[];
  rolesApplied: string[];
  rolesPending: ProposalCandidate[];
  /** Las metas del plan difieren de las vigentes. */
  goalsPending: boolean;
  /** Total de cosas por aplicar (mapas + prohibidos + roles + metas). */
  pendingTotal: number;
}

/**
 * Compara la propuesta con las reglas vigentes para mostrar qué parte ya está
 * aplicada y qué queda pendiente (el conjunto puede coincidir en mapas pero no
 * en metas o prohibidos, y al revés).
 */
export function diffProposal(proposal: RulesProposal, current?: SessionRules): ProposalDiff {
  const mapsApplied: string[] = [];
  const mapsPending: ProposalMapRule[] = [];
  for (const m of proposal.maps) {
    const rule: PoolRule | null = poolRuleFor(current, m.map);
    // Aplicado si lo propuesto está incluido en las reglas vigentes: añadir
    // mains/backups extra (ajustes propios) no invalida lo ya hecho.
    const ok = rule != null && containsAll(rule.main, m.main) && containsAll(rule.backup, m.backup);
    if (ok) mapsApplied.push(m.map);
    else mapsPending.push(m);
  }

  const bannedApplied = proposal.bannedAgents.filter((b) => current?.bannedAgents.includes(b.name)).map((b) => b.name);
  const bannedPending = proposal.bannedAgents.filter((b) => !current?.bannedAgents.includes(b.name));
  const rolesApplied = proposal.bannedRoles.filter((r) => current?.bannedRoles.includes(r.name)).map((r) => r.name);
  const rolesPending = proposal.bannedRoles.filter((r) => !current?.bannedRoles.includes(r.name));

  const p = proposal.rules.goals;
  const g = current?.goals;
  const goalsPending = !(
    g &&
    g.wr === p.wr &&
    g.kd === p.kd &&
    g.acs === p.acs &&
    g.hsPct === p.hsPct &&
    g.adr === p.adr &&
    Boolean(g.fbPositive) === Boolean(p.fbPositive)
  );

  return {
    mapsApplied,
    mapsPending,
    bannedApplied,
    bannedPending,
    rolesApplied,
    rolesPending,
    goalsPending,
    pendingTotal: mapsPending.length + bannedPending.length + rolesPending.length + (goalsPending ? 1 : 0),
  };
}
