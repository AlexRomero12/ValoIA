'use client';

import { useMemo, useState } from 'react';
import { agentCombos, agentMatrix, type AgentCombo, type CompareFilters, type PlayerStats } from '@/lib/compare';
import type { MatchRow } from '@/lib/types';
import { wrColor } from '@/lib/metas';
import { useAgentIcons, agentIconLookup } from '@/lib/hooks';

interface PlayerInput {
  id: string;
  label: string;
  color: string;
  matches: MatchRow[];
}

interface AgentCardsProps {
  players: PlayerInput[];
  filters: CompareFilters;
  minGames: number;
}

/** Agentes visibles por jugador antes de "Ver todos". */
const TOP_AGENTS = 4;

function rrText(s: PlayerStats): string {
  if (s.rrTotal == null) return '—';
  return `${s.rrTotal > 0 ? '+' : ''}${s.rrTotal}${s.rrMissing > 0 ? '~' : ''}`;
}

/** Vista móvil "Por jugador": una tarjeta por jugador con la lista de sus agentes. */
export function AgentByPlayerCards({ players, filters, minGames }: AgentCardsProps) {
  const { data } = useAgentIcons();
  const icons = useMemo(() => agentIconLookup(data), [data]);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const byPlayer = useMemo(() => {
    const combos = agentCombos(players, filters, minGames);
    const map = new Map<string, AgentCombo[]>();
    for (const c of combos) {
      const list = map.get(c.playerId);
      if (list) list.push(c);
      else map.set(c.playerId, [c]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.stats.games - a.stats.games || b.stats.wr - a.stats.wr);
    }
    return map;
  }, [players, filters, minGames]);

  const cards = players.filter((p) => (byPlayer.get(p.id)?.length ?? 0) > 0);
  if (!cards.length) return <p className="empty">Sin combinaciones jugador × agente con estos filtros.</p>;

  return (
    <div>
      {cards.map((p) => {
        const list = byPlayer.get(p.id) ?? [];
        const expanded = open[p.id] === true;
        const visible = expanded ? list : list.slice(0, TOP_AGENTS);
        const hidden = list.length - visible.length;
        // Mejor agente con muestra suficiente (evita un 100% de una sola partida).
        const best =
          list.filter((c) => c.stats.games >= 2).sort((a, b) => b.stats.wr - a.stats.wr || b.stats.games - a.stats.games)[0] ??
          null;
        return (
          <article key={p.id} className="agent-card">
            <div className="ac-head">
              <span className="p-dot" style={{ background: p.color }} />
              <b>{p.label}</b>
              {best ? <span className="ac-best">Mejor: {best.agent} · {best.stats.wr.toFixed(0)}%</span> : null}
            </div>
            {visible.map((c) => {
              const icon = icons.get(c.agent.toLowerCase()) ?? null;
              return (
                <div key={c.agent} className="ac-row">
                  <span className="ac-agent">
                    {icon ? (
                      <img className="agent-icon" src={icon} alt="" loading="lazy" />
                    ) : (
                      <span className="agent-icon agent-letter">{c.agent.slice(0, 1)}</span>
                    )}
                    <b>{c.agent}</b>
                    <small>{c.stats.games}p</small>
                  </span>
                  <span className="ac-wr" style={{ color: wrColor(c.stats.wr) }}>{c.stats.wr.toFixed(0)}%</span>
                  <span className="ac-sub">
                    {c.stats.wins}V–{c.stats.losses}{c.stats.draws ? `–${c.stats.draws}E` : ''} · K/D{' '}
                    {c.stats.kd.toFixed(2)} · ACS {Math.round(c.stats.acs)} · RR {rrText(c.stats)}
                  </span>
                </div>
              );
            })}
            {hidden > 0 || expanded ? (
              <button
                type="button"
                className="f-chip ac-more"
                onClick={() => setOpen((o) => ({ ...o, [p.id]: !expanded }))}
              >
                {expanded ? 'Ver menos' : `Ver todos (+${hidden})`}
              </button>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

/** Vista móvil "Por agente": tarjeta por agente con filas por jugador (heatmap legible). */
export function AgentByAgentCards({ players, filters, minGames }: AgentCardsProps) {
  const { data } = useAgentIcons();
  const icons = useMemo(() => agentIconLookup(data), [data]);

  const { agents, cells, totals } = useMemo(() => agentMatrix(players, filters), [players, filters]);
  const min = Math.max(1, minGames);

  const cards = agents
    .map((agent) => ({
      agent,
      rows: players
        .map((p) => ({ player: p, cell: cells.get(`${p.id}|${agent}`) }))
        .filter((r) => r.cell != null && r.cell.games >= min)
        .sort((a, b) => (b.cell?.wr ?? 0) - (a.cell?.wr ?? 0) || (b.cell?.games ?? 0) - (a.cell?.games ?? 0)),
    }))
    .filter((c) => c.rows.length > 0);

  if (!cards.length) return <p className="empty">Sin agentes con partidas en estos filtros.</p>;

  return (
    <div>
      {cards.map(({ agent, rows }) => {
        const icon = icons.get(agent.toLowerCase()) ?? null;
        return (
          <article key={agent} className="agent-card">
            <div className="ag-head">
              {icon ? (
                <img className="agent-icon" src={icon} alt="" loading="lazy" />
              ) : (
                <span className="agent-icon agent-letter">{agent.slice(0, 1)}</span>
              )}
              <b>{agent}</b>
              <span className="ag-total">{totals.get(agent) ?? 0}p</span>
            </div>
            {rows.map(({ player, cell }) =>
              cell ? (
                <div key={player.id} className="ag-row">
                  <span className="ag-player">
                    <span className="p-dot" style={{ background: player.color }} />
                    <b>{player.label}</b>
                  </span>
                  <span className="ag-wr" style={{ color: wrColor(cell.wr) }}>{cell.wr.toFixed(0)}%</span>
                  <span className="ag-sub">
                    {cell.wins}V–{cell.losses}{cell.draws ? `–${cell.draws}E` : ''} · {cell.games}p
                  </span>
                </div>
              ) : null,
            )}
          </article>
        );
      })}
    </div>
  );
}
