'use client';

import { useState } from 'react';
import { wrColor } from '@/lib/metas';
import { TierIcon } from '@/components/TierIcon';
import type { PlayerStats } from '@/lib/compare';
import type { MetricKey } from '@/lib/compare';

export interface RankRow {
  id: string;
  label: string;
  color: string;
  tier: number;
  elo: number | null;
  rr: number | null;
  loading: false;
  stats: PlayerStats;
}

export type SortKey = 'wr' | 'kd' | 'acs' | 'adr' | 'hsPct' | 'games' | 'rr';

interface RankingTableProps {
  rows: RankRow[];
  sortKey: SortKey;
  onSortKey: (k: SortKey) => void;
}

const COLUMNS: { key: SortKey; label: string; fmt: (r: RankRow) => string; better: 'high' | 'low' }[] = [
  { key: 'wr', label: 'WR%', fmt: (r) => `${r.stats.wr.toFixed(1)}%`, better: 'high' },
  { key: 'kd', label: 'K/D', fmt: (r) => r.stats.kd.toFixed(2), better: 'high' },
  { key: 'acs', label: 'ACS', fmt: (r) => String(Math.round(r.stats.acs)), better: 'high' },
  { key: 'adr', label: 'ADR', fmt: (r) => String(Math.round(r.stats.adr)), better: 'high' },
  { key: 'hsPct', label: 'HS%', fmt: (r) => `${r.stats.hsPct.toFixed(1)}%`, better: 'high' },
  { key: 'games', label: 'Partidas', fmt: (r) => `${r.stats.wins}–${r.stats.losses}`, better: 'high' },
  { key: 'rr', label: 'RR neto', fmt: (r) => (r.stats.rrTotal == null ? '—' : `${r.stats.rrTotal > 0 ? '+' : ''}${r.stats.rrTotal}`), better: 'high' },
];

const MEDALS = ['🥇', '🥈', '🥉'];

export function RankingTable({ rows, sortKey, onSortKey }: RankingTableProps) {
  const [asc, setAsc] = useState<Record<string, boolean>>({});

  const sorted = [...rows].sort((a, b) => {
    const dir = asc[sortKey] ? 1 : -1;
    const va = metricValue(a, sortKey);
    const vb = metricValue(b, sortKey);
    if (va == null && vb == null) return b.stats.games - a.stats.games;
    if (va == null) return 1;
    if (vb == null) return -1;
    return (va - vb) * dir;
  });

  const withRank = sorted.map((r, i) => ({ ...r, pos: i + 1 }));

  return (
    <div className="table-scroll">
      <table className="matches rank-table">
        <colgroup>
          <col style={{ width: '6%' }} /><col style={{ width: '20%' }} /><col style={{ width: '16%' }} />
          <col style={{ width: '9%' }} /><col style={{ width: '9%' }} /><col style={{ width: '8%' }} />
          <col style={{ width: '8%' }} /><col style={{ width: '8%' }} /><col style={{ width: '8%' }} />
          <col style={{ width: '8%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>#</th>
            <th>Jugador</th>
            <th>Rango · MMR</th>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                className={`num sortable${sortKey === c.key ? ' sorted' : ''}`}
                onClick={() => {
                  onSortKey(c.key);
                  setAsc((a) => ({ ...a, [c.key]: !a[c.key] }));
                }}
                title={`Ordenar por ${c.label}`}
              >
                {sortKey === c.key ? (asc[c.key] ? '↑ ' : '↓ ') : ''}{c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {withRank.map((r) => (
            <tr key={r.id}>
              <td className="pos">{sortKey === primaryOf(sortKey) ? (MEDALS[r.pos - 1] ?? r.pos) : r.pos}</td>
              <td>
                <span className="icon-cell">
                  <span className="p-dot" style={{ background: r.color }} />
                  <b>{r.label}</b>
                </span>
              </td>
              <td className="muted-cell"><TierIcon tier={r.tier} size={20} />{r.rr != null ? <span className="rr-cell rr-up"> {r.rr} RR</span> : ''}</td>
              {COLUMNS.map((c) => {
                const isBest = bestId(rows, c.key, c.better) === r.id;
                const val = metricValue(r, c.key);
                return (
                  <td
                    key={c.key}
                    className={`num${isBest && val != null ? ' stat-ok' : ''}${sortKey === c.key ? ' col-sorted' : ''}`}
                    title={c.label}
                  >
                    {(sortKey === c.key ? (MEDALS[r.pos - 1] ? `${MEDALS[r.pos - 1]} ` : '') : '') + c.fmt(r)}
                  </td>
                );
              })}
            </tr>
          ))}
          {!rows.length && (
            <tr><td colSpan={10}><p className="empty">Ningún jugador cumple el mínimo de partidas en esta ventana.</p></td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function primaryOf(k: SortKey): SortKey {
  return k;
}

function metricValue(r: RankRow, k: SortKey): number | null {
  switch (k) {
    case 'wr': return r.stats.wr;
    case 'kd': return r.stats.kd;
    case 'acs': return r.stats.acs;
    case 'adr': return r.stats.adr;
    case 'hsPct': return r.stats.hsPct;
    case 'games': return r.stats.games || null;
    case 'rr': return r.stats.rrTotal ?? null;
  }
}

function bestId(rows: RankRow[], k: SortKey, better: 'high' | 'low'): string | null {
  let best: RankRow | null = null;
  for (const r of rows) {
    const v = metricValue(r, k);
    if (v == null) continue;
    const bv = best ? metricValue(best, k) : null;
    if (bv == null || (better === 'high' ? v > bv : v < bv)) best = r;
  }
  return best?.id ?? null;
}

export { wrColor };
