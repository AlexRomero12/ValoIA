'use client';

import { METAS, type Kpis } from '@/lib/metas';

interface KpiGridProps {
  kpis: Kpis;
  accent: string;
}

export function KpiGrid({ kpis: k, accent }: KpiGridProps) {
  return (
    <div className="kpis" style={{ ['--accent-kpi' as string]: accent }}>
      <div className="kpi">
        <div className="label">Partidas</div>
        <div className="value">{k.matches}</div>
        <div className="target"><b>{k.wins}V</b> · {k.losses}D</div>
        <div className="meter"><div className="fill" style={{ width: `${Math.min(100, k.matches * 10)}%`, background: 'var(--gold)' }} /></div>
      </div>
      {METAS.map((m) => {
        const v = m.get(k);
        const ok = v >= m.target;
        const pct = Math.max(4, Math.min(100, (v / m.target) * 100));
        return (
          <div key={m.key} className={`kpi ${ok ? 'ok' : ''}`}>
            <div className="label">{m.label}</div>
            <div className="value">{m.fmt(v)}</div>
            <div className="target">meta ≥ {m.fmt(m.target)}</div>
            <div className="meter">
              <div className="fill" style={{ width: `${pct}%`, background: ok ? 'var(--win)' : 'var(--loss)' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
