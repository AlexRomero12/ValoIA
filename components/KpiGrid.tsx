'use client';

import type { ReactNode } from 'react';
import { METAS, type Kpis } from '@/lib/metas';
import { deltaOf } from '@/lib/form';
import { InfoTip } from './InfoTip';

interface KpiGridProps {
  kpis: Kpis;
  /** Ventana anterior (misma duración) para los deltas; sin muestra suficiente no se pintan. */
  prev?: Kpis | null;
  accent: string;
}

/** Mínimo de partidas de la ventana anterior para mostrar deltas. */
const MIN_PREV_MATCHES = 3;

export function KpiGrid({ kpis: k, prev, accent }: KpiGridProps) {
  const prevK = prev && prev.matches >= MIN_PREV_MATCHES ? prev : null;
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
        const delta = prevK ? deltaOf(v, m.get(prevK)) : null;
        const deltaTxt = delta != null ? m.fmt(Math.abs(delta)) : null;
        let deltaNode: ReactNode = null;
        if (delta != null && deltaTxt != null && prevK) {
          // Oculta deltas que formatean a cero (p. ej. ACS +0).
          const meaningful = Number(deltaTxt.replace(/[^\d.]/g, '')) > 0;
          if (meaningful) {
            const good = m.lowerIsBetter ? delta <= 0 : delta >= 0;
            deltaNode = (
              <span
                className={`kpi-delta ${good ? 'up' : 'down'}`}
                title={`vs ${prevK.matches} partidas de la ventana anterior`}
              >
                {delta > 0 ? '+' : '−'}{deltaTxt}
              </span>
            );
          }
        }
        return (
          <div key={m.key} className={`kpi ${ok ? 'ok' : ''}`}>
            <div className="label">
              {m.label}
              {m.tip ? <InfoTip text={m.tip} label={`Qué es ${m.label}`} /> : null}
            </div>
            <div className="value">{m.fmt(v)}</div>
            {deltaNode}
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
