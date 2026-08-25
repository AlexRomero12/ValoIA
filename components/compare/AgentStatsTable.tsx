'use client';

import { useMemo, useState } from 'react';
import { applyFilters, statsFromMatches, type CompareFilters, type PlayerStats } from '@/lib/compare';
import type { MatchRow } from '@/lib/types';
import { useAgentIcons, agentIconLookup } from '@/lib/hooks';

interface PlayerInput {
  id: string;
  label: string;
  color: string;
  matches: MatchRow[];
}

interface AgentStatsTableProps {
  players: PlayerInput[];
  filters: CompareFilters;
  minGames: number;
}

interface ComboRow {
  key: string;
  playerId: string;
  label: string;
  color: string;
  agent: string;
  stats: PlayerStats;
}

type Mode = 'all' | 'best';
type SortKey = 'games' | 'wr' | 'kd' | 'acs' | 'adr' | 'hsPct' | 'rr';

const COLUMNS: { key: SortKey; label: string; fmt: (s: PlayerStats) => string; bar?: boolean }[] = [
  { key: 'games', label: 'Partidas', fmt: (s) => String(s.games) },
  { key: 'games', label: 'W-L', fmt: (s) => `${s.wins}–${s.losses}` },
  { key: 'wr', label: 'WR%', fmt: (s) => `${s.wr.toFixed(1)}%`, bar: true },
  { key: 'kd', label: 'K/D', fmt: (s) => s.kd.toFixed(2) },
  { key: 'acs', label: 'ACS', fmt: (s) => String(Math.round(s.acs)), bar: true },
  { key: 'adr', label: 'ADR', fmt: (s) => String(Math.round(s.adr)), bar: true },
  { key: 'hsPct', label: 'HS%', fmt: (s) => `${s.hsPct.toFixed(1)}%`, bar: true },
  { key: 'rr', label: 'RR neto', fmt: (s) => (s.rrTotal == null ? '—' : `${s.rrTotal > 0 ? '+' : ''}${s.rrTotal}`) },
];

function sortValue(s: PlayerStats, k: SortKey): number {
  switch (k) {
    case 'games': return s.games;
    case 'wr': return s.wr;
    case 'kd': return s.kd;
    case 'acs': return s.acs;
    case 'adr': return s.adr;
    case 'hsPct': return s.hsPct;
    case 'rr': return s.rrTotal ?? Number.NEGATIVE_INFINITY;
  }
}

export function AgentStatsTable({ players, filters, minGames }: AgentStatsTableProps) {
  const [mode, setMode] = useState<Mode>('best');
  const [sortKey, setSortKey] = useState<SortKey>('wr');
  const [asc, setAsc] = useState<Record<string, boolean>>({});
  const { data } = useAgentIcons();
  const icons = useMemo(() => agentIconLookup(data), [data]);

  const rows = useMemo(() => {
    const out: ComboRow[] = [];
    for (const p of players) {
      const filtered = applyFilters(p.matches, filters);
      const byAgent = new Map<string, MatchRow[]>();
      for (const m of filtered) {
        const list = byAgent.get(m.agent);
        if (list) list.push(m);
        else byAgent.set(m.agent, [m]);
      }
      for (const [agent, ms] of byAgent) {
        const stats = statsFromMatches(ms);
        if (stats.games < minGames) continue;
        out.push({ key: `${p.id}|${agent}`, playerId: p.id, label: p.label, color: p.color, agent, stats });
      }
    }
    if (mode === 'best') {
      const bestPerPlayer = new Map<string, ComboRow>();
      for (const r of out) {
        const cur = bestPerPlayer.get(r.playerId);
        if (!cur || r.stats.wr > cur.stats.wr || (r.stats.wr === cur.stats.wr && r.stats.games > cur.stats.games)) {
          bestPerPlayer.set(r.playerId, r);
        }
      }
      return [...bestPerPlayer.values()];
    }
    return out;
  }, [players, filters, minGames, mode]);

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const dir = asc[sortKey] ? 1 : -1;
        return (sortValue(a.stats, sortKey) - sortValue(b.stats, sortKey)) * dir || b.stats.games - a.stats.games;
      }),
    [rows, sortKey, asc],
  );

  const maxes = useMemo(() => {
    const mx: Partial<Record<SortKey, number>> = {};
    for (const c of COLUMNS) {
      if (!c.bar) continue;
      let v = 0;
      for (const r of rows) v = Math.max(v, Math.max(0, sortValue(r.stats, c.key)));
      mx[c.key] = v > 0 ? v : 1;
    }
    return mx;
  }, [rows]);

  if (!rows.length) {
    return <p className="empty">Sin combinaciones jugador × agente con estos filtros.</p>;
  }

  return (
    <div>
      <div className="combo-toolbar">
        <span className="combo-count">{sorted.length} combinaciones</span>
        <div className="pill-toggle" role="group" aria-label="Modo de filas">
          <button
            type="button"
            className={mode === 'best' ? 'on' : ''}
            onClick={() => setMode('best')}
          >
            Mejor de cada jugador
          </button>
          <button
            type="button"
            className={mode === 'all' ? 'on' : ''}
            onClick={() => setMode('all')}
          >
            Todas las combinaciones
          </button>
        </div>
      </div>
      <div className="table-scroll">
        <table className="matches rank-table agent-stats">
          <colgroup>
            <col style={{ width: '15%' }} /><col style={{ width: '13%' }} /><col style={{ width: '8%' }} />
            <col style={{ width: '9%' }} /><col style={{ width: '11%' }} /><col style={{ width: '8%' }} />
            <col style={{ width: '9%' }} /><col style={{ width: '9%' }} /><col style={{ width: '9%' }} />
            <col style={{ width: '9%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Agente</th>
              <th>Jugador</th>
              {COLUMNS.map((c, i) => (
                <th
                  key={`${c.key}-${i}`}
                  className={`num sortable${sortKey === c.key ? ' sorted' : ''}`}
                  onClick={() => {
                    setSortKey(c.key);
                    setAsc((a) => ({ ...a, [c.key]: !a[c.key] }));
                  }}
                  title={`Ordenar por ${c.label}`}
                >
                  {c.label}
                  {sortKey === c.key ? (asc[c.key] ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const icon = icons.get(r.agent.toLowerCase()) ?? null;
              return (
                <tr key={r.key}>
                  <td className="agent">
                    <span className="icon-cell">
                      {icon ? (
                        <img className="agent-icon" src={icon} alt="" loading="lazy" />
                      ) : (
                        <span className="agent-icon agent-letter">{r.agent.slice(0, 1)}</span>
                      )}
                      <b>{r.agent}</b>
                    </span>
                  </td>
                  <td>
                    <span className="icon-cell">
                      <span className="p-dot" style={{ background: r.color }} />
                      {r.label}
                    </span>
                  </td>
                  {COLUMNS.map((c, i) => {
                    const isSortedCol = sortKey === c.key;
                    const val = sortValue(r.stats, c.key);
                    const pct = c.bar && val > 0 ? Math.min(100, (val / (maxes[c.key] ?? 1)) * 100) : 0;
                    return (
                      <td key={`${c.key}-${i}`} className={`num${isSortedCol ? ' col-sorted' : ''}`} title={c.label}>
                        {c.bar ? (
                          <span className="cellbar">
                            <i className="cellbar-fill" style={{ width: `${pct}%` }} />
                            <span className="cellbar-num">{c.fmt(r.stats)}</span>
                          </span>
                        ) : (
                          c.fmt(r.stats)
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
