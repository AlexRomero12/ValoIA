'use client';

import { useMemo } from 'react';
import { wrColor } from '@/lib/metas';
import type { MatchRow } from '@/lib/types';
import type { CompareFilters } from '@/lib/compare';
import { applyFilters } from '@/lib/compare';
import { useAgentIcons, agentIconLookup } from '@/lib/hooks';

interface AgentHeatmapProps {
  players: { id: string; label: string; matches: MatchRow[] }[];
  filters: CompareFilters;
  minGames: number;
}

export function AgentHeatmap({ players, filters, minGames }: AgentHeatmapProps) {
  const { data } = useAgentIcons();
  const icons = useMemo(() => agentIconLookup(data), [data]);
  const agentSet = new Set<string>();
  const perPlayer = players.map((p) => ({ ...p, filtered: applyFilters(p.matches, filters) }));
  for (const p of perPlayer) for (const m of p.filtered) agentSet.add(m.agent);
  const agents = [...agentSet];

  const cell = new Map<string, { games: number; wins: number }>();
  for (const p of perPlayer) {
    for (const m of p.filtered) {
      const key = `${p.id}|${m.agent}`;
      const c = cell.get(key) ?? { games: 0, wins: 0 };
      c.games += 1;
      if (m.won) c.wins += 1;
      cell.set(key, c);
    }
  }

  const rows = agents
    .map((a) => ({
      agent: a,
      total: perPlayer.reduce(
        (acc, p) => acc + (cell.get(`${p.id}|${a}`)?.games ?? 0),
        0,
      ),
    }))
    .sort((x, y) => y.total - x.total)
    .filter((r) => r.total > 0);

  if (!rows.length) return <p className="empty">Sin partidas para el heatmap con estos filtros.</p>;

  return (
    <div className="table-scroll">
      <table className="heatmap">
        <thead>
          <tr>
            <th>Agente</th>
            {perPlayer.map((p) => (
              <th key={p.id} className="num">{escSafe(p.label)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ agent }) => {
            const icon = icons.get(agent.toLowerCase()) ?? null;
            return (
              <tr key={agent}>
                <td className="hm-agent">
                  <span className="icon-cell">
                    {icon ? <img className="agent-icon hm-agent-icon" src={icon} alt="" loading="lazy" /> : null}
                    {agent}
                  </span>
                </td>
              {perPlayer.map((p) => {
                const c = cell.get(`${p.id}|${agent}`);
                if (!c || c.games === 0 || c.games < Math.max(1, minGames)) {
                  return <td key={p.id} className="num hm-empty">—</td>;
                }
                const wr = (c.wins / c.games) * 100;
                return (
                  <td key={p.id} className="num" title={`${wr.toFixed(1)}% · ${c.wins}V–${c.games - c.wins}D`}>
                    <span
                      className="hm-val"
                      style={{ background: `rgba(236,232,225,${(0.04 + Math.min(wr, 100) / 100 * 0.16).toFixed(3)})`, borderColor: wrColor(wr) }}
                    >
                      {wr.toFixed(0)}%<small> {c.games}p</small>
                    </span>
                  </td>
                );
              })}
            </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

function escSafe(s: string): string {
  return s.replace(/[&<>]/g, '');
}
