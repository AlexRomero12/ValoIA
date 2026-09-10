'use client';

import type { BucketPoint } from '@/lib/compare';
import { pickXMarks } from '@/lib/chartAxis';

export interface TrendSeries {
  id: string;
  label: string;
  color: string;
  points: BucketPoint[];
}

interface TrendCompareProps {
  series: TrendSeries[];
  fmt: (v: number) => string;
  /** Piso del eje Y (la línea se recorta debajo de él). */
  minValue?: number;
  /** Valores explícitos para las líneas de cuadrícula del eje Y. */
  ticks?: number[];
}

export function TrendCompare({ series, fmt, minValue, ticks }: TrendCompareProps) {
  const active = series.filter((s) => s.points.some((p) => p.value != null));
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
  let max = Math.max(...values);
  const pad = Math.max((max - (minValue ?? Math.min(...values))) * 0.15, max * 0.05, 1);
  const min = minValue ?? Math.max(0, Math.min(...values) - pad);
  max = max + pad;

  const W = 940, H = 280, PL = 56, PR = 16, PT = 16, PB = 36;
  const cw = W - PL - PR, ch = H - PT - PB;
  const xAt = (i: number) => PL + (labels.length === 1 ? cw / 2 : (i / (labels.length - 1)) * cw);
  const yAt = (v: number) => PT + ch - ((v - min) / Math.max(1e-9, max - min)) * ch;

  const gridVals = (ticks && ticks.length ? ticks.filter((t) => t >= min && t <= max) : [0, 1, 2, 3, 4].map((g) => min + ((max - min) * g) / 4));
  // Etiquetas del eje X: una por día distinto (en la primera posición donde
  // aparece), no una por punto. Con un punto por partida el eje repetía el
  // mismo "03/09" 8 veces seguidas y no se entendía nada.
  const labelAt = (key: string): string =>
    labelOf.get(key) ??
    (key.startsWith('w-')
      ? (() => {
          const d = key.slice(2).split('-').map(Number);
          return d.length === 3
            ? `${String(d[2]).padStart(2, '0')}/${String(d[1]).padStart(2, '0')}`
            : key;
        })()
      : key);
  // Separación mínima real en píxeles (ver lib/chartAxis.ts): días de 1-2
  // partidas dejaban marcas en puntos adyacentes que se encimaban igual.
  const showSet = pickXMarks({ count: labels.length, labelOf: (i) => labelAt(labels[i]), plotW: cw });

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
          if (!showSet.has(i)) return null;
          return <text key={key} x={xAt(i)} y={H - PB + 18} fontSize="9" fill="#5d7080" textAnchor="middle">{labelAt(key)}</text>;
        })}
        {active.map((s) => {
          const pts = s.points
            .map((p) => ({ ...p, i: labels.indexOf(p.key), v: p.value }))
            .filter((p) => p.i >= 0);
          // Segmentos separados por huecos (días sin partidas): la línea se
          // corta en vez de conectar a través del vacío.
          const segs: string[] = [];
          let cur: string[] = [];
          for (const p of pts) {
            if (p.v == null) {
              if (cur.length) { segs.push(cur.join(' ')); cur = []; }
              continue;
            }
            cur.push(`${cur.length === 0 ? 'M' : 'L'}${xAt(p.i).toFixed(1)} ${yAt(p.v).toFixed(1)}`);
          }
          if (cur.length) segs.push(cur.join(' '));
          return (
            <g key={s.id}>
              {segs.map((d, si) => (
                <path key={si} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" opacity={0.9} />
              ))}
              {pts.map((p) =>
                p.v != null ? (
                  <circle
                    key={p.key}
                    cx={xAt(p.i)}
                    cy={yAt(p.v)}
                    r={3.5}
                    fill={p.approx ? '#0f1923' : s.color}
                    stroke={s.color}
                    strokeWidth={1.3}
                  >
                    <title>{`${s.label} · ${labelOf.get(p.key) ?? p.key}: ${fmt(p.v)} (${p.games}p)${p.approx ? ' · aprox.' : ''}`}</title>
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
