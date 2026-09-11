import { agentRole } from './roles';
import type { MatchRow } from './types';
import type { AuditPoolRule, AuditRules } from './profileTypes';

/**
 * Propuesta inicial de reglas de auditoría a partir de las partidas ya cargadas
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

export interface AuditProposal {
  rules: AuditRules;
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
export function buildAuditProposal(matches: MatchRow[]): AuditProposal | null {
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
  const byMap: Record<string, AuditPoolRule> = {};
  for (const [map, perAgent] of mapAgents) {
    if ((mapGames.get(map) ?? 0) < PROPOSAL.mapMinGames) continue;
    const cands: ProposalCandidate[] = [...perAgent.entries()]
      .filter(([, s]) => s.games >= PROPOSAL.agentMainMinGames)
      .map(([name, s]) => ({ name, wr: wrOf(s), games: s.games }))
      .sort((a, b) => b.wr - a.wr || b.games - a.games);
    const main = cands.filter((c) => c.wr >= PROPOSAL.agentMainMinWr).slice(0, 2);
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

  const rules: AuditRules = {
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
