import type { HenrikAgentMastery, HenrikAgentMasteryEntry } from './henrik';
import type { ValMastery, ValMasteryAgent } from './types';

/**
 * Maestría de agentes (endpoint /valorant/v1/agent-mastery, v4.10).
 *
 * Riot devuelve un `tracks[]` por agente (las pistas de recompensas) y el
 * nivel de maestría es el del primer track; `flourish` son los niveles de la
 * vitrina. Los `modules` (módulos de stats por agente) solo llegan en algunos
 * casos: si no están, se omiten en vez de inventar métricas.
 *
 * Módulo puro: sin red ni disco.
 */

function levelOf(a: HenrikAgentMasteryEntry): number {
  const tracks = a.tracks ?? [];
  let best = 0;
  for (const t of tracks) {
    if (typeof t.level === 'number' && Number.isFinite(t.level)) best = Math.max(best, t.level);
  }
  return best;
}

function agentView(a: HenrikAgentMasteryEntry): ValMasteryAgent | null {
  const id = a.agent?.id ?? '';
  const name = a.agent?.name ?? '';
  if (!id && !name) return null;
  const modules = (a.modules ?? [])
    .map((m) => ({
      label: m.stat?.name ?? m.name ?? m.stat?.id ?? m.id ?? '',
      value: typeof m.value === 'number' ? m.value : 0,
    }))
    .filter((m) => m.label !== '');
  return {
    agentId: id,
    agent: name || id,
    level: levelOf(a),
    flourishShort: a.flourish?.short_level ?? null,
    flourishLong: a.flourish?.long_level ?? null,
    modules,
  };
}

/** Nivel a partir del cual consideramos el agente "trabajado" (5 tracks). */
export const MAXED_LEVEL = 5;

export function masteryFrom(m: HenrikAgentMastery | null | undefined): ValMastery | null {
  if (!m || typeof m !== 'object') return null;
  const agents = (m.agents ?? [])
    .map(agentView)
    .filter((a): a is ValMasteryAgent => a != null)
    .sort((a, b) => b.level - a.level || a.agent.localeCompare(b.agent));
  if (!agents.length) return null;
  return {
    agents,
    totalLevel: agents.reduce((sum, a) => sum + a.level, 0),
    maxed: agents.filter((a) => a.level >= MAXED_LEVEL).length,
  };
}

/** Mapa nombre-de-agente (minúsculas) -> nivel, para cruzar con las stats. */
export function masteryByAgent(m: ValMastery | null | undefined): Map<string, ValMasteryAgent> {
  const out = new Map<string, ValMasteryAgent>();
  for (const a of m?.agents ?? []) out.set(a.agent.toLowerCase(), a);
  return out;
}

/** Los N agentes con más nivel (para el resumen del champ pool). */
export function topMastery(m: ValMastery | null | undefined, n = 5): ValMasteryAgent[] {
  return (m?.agents ?? []).slice(0, n);
}
