'use client';

import { AgentIcon } from '@/components/AgentIcon';
import { InfoTip } from '@/components/InfoTip';
import { MAXED_LEVEL } from '@/lib/mastery';
import type { ValMastery } from '@/lib/types';

/**
 * Maestría de agentes (endpoint de v4.10), encima de las stats por agente:
 * cuánto has jugado cada agente según Riot, independiente de los resultados.
 * Los agentes sin nivel (nunca jugados) no se listan.
 */
export function MasteryPanel({
  mastery,
  icons,
  loading,
  error,
}: {
  mastery: ValMastery | null | undefined;
  icons?: Map<string, string | null>;
  loading?: boolean;
  error?: string | null;
}) {
  const agents = (mastery?.agents ?? []).filter((a) => a.level > 0);
  const max = agents.length ? agents[0].level : 0;

  return (
    <div className="panel mastery-panel">
      <h2>
        Maestría
        <InfoTip text="Nivel de maestría que Riot guarda por agente (las pistas de recompensas). Mide cuánto has jugado cada agente, no lo bien que lo juegas: úsalo para ver la amplitud del champ pool." />
      </h2>
      {error ? (
        <p className="empty">{error}</p>
      ) : loading && !agents.length ? (
        <p className="empty">Cargando maestría…</p>
      ) : !agents.length ? (
        <p className="empty">Riot todavía no publica maestría para esta cuenta.</p>
      ) : (
        <>
          <p className="wr-hint">
            {agents.length} agente(s) con maestría · nivel total {mastery?.totalLevel ?? 0} ·{' '}
            {mastery?.maxed ?? 0} al máximo (nivel {MAXED_LEVEL}+)
          </p>
          <ul className="mastery-list">
            {agents.slice(0, 10).map((a) => (
              <li key={a.agentId || a.agent} className="mastery-row">
                <AgentIcon name={a.agent} icon={icons?.get(a.agent.toLowerCase()) ?? null} title={a.agent} />
                <span className="mastery-agent">{a.agent}</span>
                <span className="mastery-track" title={`Nivel ${a.level}`}>
                  <span
                    className="mastery-fill"
                    style={{ width: `${max > 0 ? Math.max(6, Math.round((a.level / max) * 100)) : 100}%` }}
                  />
                </span>
                <span className="mastery-level">{a.level}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
