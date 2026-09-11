'use client';

import { useMemo, useState } from 'react';
import { wrColor } from '@/lib/metas';
import { tierShort } from '@/lib/compare';
import { TierIcon } from '@/components/TierIcon';
import type { PlayerStats } from '@/lib/compare';

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

export type SortKey = 'wr' | 'kd' | 'acs' | 'adr' | 'hsPct' | 'games' | 'rr' | 'rank';

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
  { key: 'rr', label: 'RR neto', fmt: (r) => (r.stats.rrTotal == null ? '—' : `${r.stats.rrTotal > 0 ? '+' : ''}${r.stats.rrTotal}${r.stats.rrMissing > 0 ? '~' : ''}`), better: 'high' },
];

const MEDALS = ['🥇', '🥈', '🥉'];

/** Badges "mejor en…" de las tarjetas móviles. */
const BADGE_KEYS: { key: SortKey; label: string }[] = [
  { key: 'wr', label: 'WR' },
  { key: 'kd', label: 'K/D' },
  { key: 'acs', label: 'ACS' },
  { key: 'adr', label: 'ADR' },
  { key: 'hsPct', label: 'HS%' },
  { key: 'rr', label: 'RR' },
];

function rrText(r: RankRow): string {
  if (r.stats.rrTotal == null) return '—';
  return `${r.stats.rrTotal > 0 ? '+' : ''}${r.stats.rrTotal}${r.stats.rrMissing > 0 ? '~' : ''}`;
}

/** Valor grande de la tarjeta: la métrica activa (por defecto, WR). */
function heroOf(r: RankRow, k: SortKey): { label: string; value: string; color?: string } {
  switch (k) {
    case 'wr': return { label: 'WR', value: `${r.stats.wr.toFixed(0)}%`, color: wrColor(r.stats.wr) };
    case 'kd': return { label: 'K/D', value: r.stats.kd.toFixed(2) };
    case 'acs': return { label: 'ACS', value: String(Math.round(r.stats.acs)) };
    case 'adr': return { label: 'ADR', value: String(Math.round(r.stats.adr)) };
    case 'hsPct': return { label: 'HS', value: `${r.stats.hsPct.toFixed(1)}%` };
    case 'rr': return { label: 'RR', value: rrText(r) };
    case 'games': return { label: 'Partidas', value: String(r.stats.games) };
    case 'rank': {
      const tier = r.tier > 0 ? tierShort(r.tier) : '—';
      return { label: 'RANGO', value: r.rr != null ? `${tier} · ${r.rr}` : tier };
    }
  }
}

/** Stats secundarias del grid; la métrica grande se excluye para no duplicar. */
const GRID_STATS: { key: SortKey; label: string; fmt: (r: RankRow) => string }[] = [
  { key: 'wr', label: 'WR', fmt: (r) => `${r.stats.wr.toFixed(0)}%` },
  { key: 'kd', label: 'K/D', fmt: (r) => r.stats.kd.toFixed(2) },
  { key: 'acs', label: 'ACS', fmt: (r) => String(Math.round(r.stats.acs)) },
  { key: 'adr', label: 'ADR', fmt: (r) => String(Math.round(r.stats.adr)) },
  { key: 'hsPct', label: 'HS%', fmt: (r) => `${r.stats.hsPct.toFixed(1)}%` },
  { key: 'rr', label: 'RR neto', fmt: (r) => rrText(r) },
];

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

  // Medallas solo en orden descendente (mejor-primero): en ascendente el
  // primero es el peor y la 🥇 mentía. Los empates comparten medalla
  // (ranking de competición: 1, 1, 3…).
  const desc = !asc[sortKey];
  const vals = sorted.map((r) => metricValue(r, sortKey));
  const withRank = sorted.map((r, i) => {
    const v = vals[i];
    let medal = 0;
    if (desc && v != null) {
      let rank = 1;
      for (let j = 0; j < i; j++) {
        const u = vals[j];
        if (u != null && u > v) rank += 1;
      }
      medal = rank <= 3 ? rank : 0;
    }
    return { ...r, pos: i + 1, medal };
  });

  const bests = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const b of BADGE_KEYS) {
      const id = bestId(rows, b.key, 'high');
      if (!id) continue;
      const list = map.get(id) ?? [];
      list.push(b.label);
      map.set(id, list);
    }
    return map;
  }, [rows]);

  return (
    <div>
      {/* Móvil: una tarjeta por jugador (la tabla ancha no se lee en teléfono).
          El orden lo manda la Métrica del gráfico; en escritorio también los encabezados. */}
      <div className="rank-mobile">
        {withRank.map((r) => {
          const best = bests.get(r.id) ?? [];
          const hero = heroOf(r, sortKey);
          return (
            <article key={r.id} className="rank-card">
              <div className="rc-head">
                <span className="rc-pos">{r.medal ? MEDALS[r.medal - 1] : r.pos}</span>
                <span className="p-dot" style={{ background: r.color }} />
                <b className="rc-name">{r.label}</b>
                <span className="rc-rank">
                  <TierIcon tier={r.tier} size={18} />
                  {r.rr != null ? ` ${r.rr} RR` : ' —'}
                </span>
              </div>
              <div className="rc-main">
                <div className="rc-hero" style={hero.color ? { color: hero.color } : undefined}>
                  {hero.value}<small> {hero.label}</small>
                </div>
                <div className="rc-record">
                  {r.stats.wins}V–{r.stats.losses}{r.stats.draws ? `–${r.stats.draws}E` : ''} · {r.stats.games}p
                </div>
              </div>
              <div className="rc-grid">
                {GRID_STATS.filter((s) => s.key !== sortKey).map((s) => (
                  <div key={s.key} className="rc-stat">
                    <span>{s.label}</span>
                    <b>{s.fmt(r)}</b>
                  </div>
                ))}
              </div>
              {rows.length > 1 && best.length ? <span className="rc-best">Mejor en {best.join(' · ')}</span> : null}
            </article>
          );
        })}
        {!rows.length && <p className="empty">Ningún jugador cumple el mínimo de partidas en esta ventana.</p>}
      </div>

      {/* Escritorio/tablet: tabla comparativa completa. */}
      <div className="table-scroll rank-desktop">
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
                  title={c.key === 'rr' ? 'Ordenar por RR neto (~ = parcial: hay partidas sin dato de RR)' : `Ordenar por ${c.label}`}
                >
                  {sortKey === c.key ? (asc[c.key] ? '↑ ' : '↓ ') : ''}{c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {withRank.map((r) => (
              <tr key={r.id}>
                <td className="pos">{r.medal ? MEDALS[r.medal - 1] : r.pos}</td>
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
                      title={c.key === 'rr' && r.stats.rrMissing > 0 ? `RR de ${r.stats.games - r.stats.rrMissing}/${r.stats.games} partidas (${r.stats.rrMissing} sin dato)` : c.label}
                    >
                      {(r.medal ? `${MEDALS[r.medal - 1]} ` : '') + c.fmt(r)}
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
    </div>
  );
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
    case 'rank': return r.elo ?? (r.tier > 0 ? r.tier * 100 : null);
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
