'use client';

import type { BucketPoint } from '@/lib/compare';

export interface TrendSeries {
  id: string;
  label: string;
  color: string;
  points: BucketPoint[];
}

interface TrendCompareProps {
  series: TrendSeries[];
  fmt: (v: number) => string;
}

export function TrendCompare({ series, fmt }: TrendCompareProps) {
  const active = series.filter((s) => s.points.length > 0);
  if (!active.length) return <p className="empty">Sin datos suficientes para la evolución con estos filtros.</p>;

  const labels: string[] = [];
  const seen = new Set<string>();
  for (const s of active) {
    for (const p of s.points) {
      if (!seen.has(p.key)) {
        seen.add(p.key);
        labels.push(p.key);
      }
    }
  }
  labels.sort();
  const labelOf = new Map<string, string>();
  for (const s of active) for (const p of s.points) if (!labelOf.has(p.key)) labelOf.set(p.key, p.label);

  const values: number[] = [];
  for (const s of active) for (const p of s.points) if (p.value != null) values.push(p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  const pad = Math.max((max - min) * 0.15, max * 0.05, 1);
  min = Math.max(0, min - pad);
  max = max + pad;

  const W = 940, H = 280, PL = 56, PR = 16, PT = 16, PB = 36;
  const cw = W - PL - PR, ch = H - PT - PB;
  const xAt = (i: number) => PL + (labels.length === 1 ? cw / 2 : (i / (labels.length - 1)) * cw);
  const yAt = (v: number) => PT + ch - ((v - min) / Math.max(1e-9, max - min)) * ch;

  const gridVals = [0, 1, 2, 3, 4].map((g) => min + ((max - min) * g) / 4);
  const labelStep = Math.ceil(labels.length / 10);

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img">
        {gridVals.map((v, i) => {
          const y = yAt(v);
          return (
            <g key={i}>
              <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#20303f" strokeWidth={1} />
              <text x={PL - 8} y={y + 4} fontSize="10" fill="#5d7080" textAnchor="end">{fmt(v)}</text>
            </g>
          );
        })}
        {labels.map((key, i) => {
          if (i % labelStep !== 0 && i !== labels.length - 1) return null;
          const d = key.startsWith('w-') ? key.slice(2).split('-').map(Number) : null;
          const lbl = d ? `${String(d[2]).padStart(2, '0')}/${String(d[1] + 1).padStart(2, '0')}` : (labelOf.get(key) ?? '');
          return <text key={key} x={xAt(i)} y={H - PB + 18} fontSize="9" fill="#5d7080" textAnchor="middle">{lbl}</text>;
        })}
        {active.map((s) => {
          const pts = s.points
            .map((p) => ({ ...p, i: labels.indexOf(p.key), v: p.value }))
            .filter((p) => p.i >= 0);
          const path = pts
            .filter((p) => p.v != null)
            .map((p, idx) => `${idx === 0 ? 'M' : 'L'}${xAt(p.i).toFixed(1)} ${yAt(p.v!).toFixed(1)}`)
            .join(' ');
          return (
            <g key={s.id}>
              {path && <path d={path} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" opacity={0.9} />}
              {pts.map((p) =>
                p.v != null ? (
                  <circle key={p.key} cx={xAt(p.i)} cy={yAt(p.v)} r={3.5} fill={s.color} stroke="#0f1923" strokeWidth={1.3}>
                    <title>{`${s.label} · ${labelOf.get(p.key) ?? p.key}: ${fmt(p.v)} (${p.games}p)`}</title>
                  </circle>
                ) : null,
              )}
            </g>
          );
        })}
      </svg>
      <div className="legend">
        {active.map((s) => (
          <span key={s.id}>
            <span className="sw" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
