'use client';

import { METAS, type Kpis } from '@/lib/metas';
import { InfoTip } from './InfoTip';

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
        <div className="target"><b>{k.wins}V</b> · {k.losses}D{k.draws ? ` · ${k.draws}E` : ''}</div>
        <div className="meter"><div className="fill" style={{ width: `${Math.min(100, k.matches * 10)}%`, background: 'var(--gold)' }} /></div>
      </div>
      {METAS.map((m) => {
        const v = m.get(k);
        if (v == null || !Number.isFinite(v)) return null;
        const ok = m.lowerIsBetter ? v <= m.target : v >= m.target;
        const pct = m.lowerIsBetter
          ? v <= 0
            ? 100
            : Math.max(4, Math.min(100, (m.target / v) * 100))
          : Math.max(4, Math.min(100, (v / m.target) * 100));
        return (
          <div key={m.key} className={`kpi ${ok ? 'ok' : ''}`}>
            <div className="label">
              {m.label}
              {m.tip ? <InfoTip text={m.tip} label={`Qué es ${m.label}`} /> : null}
            </div>
            <div className="value">{m.fmt(v)}</div>
            <div className="target">{m.targetHint ?? `meta ≥ ${m.fmt(m.target)}`}</div>
            <div className="meter">
              <div className="fill" style={{ width: `${pct}%`, background: ok ? 'var(--win)' : 'var(--loss)' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
