'use client';

import { useState } from 'react';
import type { BucketPoint } from '@/lib/compare';
import { pickXMarks } from '@/lib/chartAxis';
import { useElementWidth } from '@/lib/useElementWidth';

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
  const { ref: boxRef, width: boxW } = useElementWidth(940);
  /** Columna seleccionada al tocar (reemplaza los tooltips en táctil). */
  const [selIdx, setSelIdx] = useState<number | null>(null);
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

  const compact = boxW < 560;
  const W = compact ? Math.max(300, Math.round(boxW)) : 940;
  const H = compact ? 220 : 280;
  const PL = compact ? 44 : 56;
  const PR = compact ? 12 : 16;
  const PT = 16;
  const PB = compact ? 30 : 36;
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
  const showSet = pickXMarks({ count: labels.length, labelOf: (i) => labelAt(labels[i]), plotW: cw, minPx: compact ? 40 : 48 });

  const tapValues: { label: string; color: string; text: string }[] =
    selIdx == null
      ? []
      : active
          .map((s) => {
            const p = s.points.find((pt) => pt.key === labels[selIdx] && pt.value != null);
            return p && p.value != null
              ? { label: s.label, color: s.color, text: `${fmt(p.value)}${p.approx ? ' ~' : ''} (${p.games}p)` }
              : null;
          })
          .filter((v): v is { label: string; color: string; text: string } => v !== null);

  return (
    <div className="chart-wrap" ref={boxRef}>
      {selIdx != null && labels[selIdx] ? (
        <div className="chart-tap-info">
          <b>{labelAt(labels[selIdx])}</b>
          {tapValues.length
            ? tapValues.map((v) => (
                <span key={v.label}>
                  <span className="sw" style={{ background: v.color }} />
                  {v.label}: {v.text}
                </span>
              ))
            : <span>sin datos</span>}
        </div>
      ) : null}
      <svg viewBox={`0 0 ${W} ${H}`} role="img">
        {gridVals.map((v, i) => {
          const y = yAt(v);
          return (
            <g key={i}>
              <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#20303f" strokeWidth={1} />
              <text x={PL - 8} y={y + 4} fontSize={compact ? 11 : 10} fill="#5d7080" textAnchor="end">{fmt(v)}</text>
            </g>
          );
        })}
        {labels.map((key, i) => {
          if (!showSet.has(i)) return null;
          return <text key={key} x={xAt(i)} y={H - PB + (compact ? 16 : 18)} fontSize={compact ? 11 : 9} fill="#5d7080" textAnchor="middle">{labelAt(key)}</text>;
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
        {selIdx != null && selIdx < labels.length ? (
          <line x1={xAt(selIdx)} y1={PT} x2={xAt(selIdx)} y2={H - PB} stroke="#ece8e1" strokeWidth="1" strokeDasharray="3 3" opacity="0.45" />
        ) : null}
        {/* Zonas táctiles por columna: tocar selecciona (reemplaza los tooltips). */}
        {labels.map((key, i) => (
          <rect
            key={`hit-${key}`}
            x={xAt(i) - Math.max(8, cw / Math.max(1, labels.length) / 2)}
            y={0}
            width={Math.max(16, cw / Math.max(1, labels.length))}
            height={H}
            fill="transparent"
            style={{ cursor: 'pointer' }}
            onClick={() => setSelIdx(selIdx === i ? null : i)}
          />
        ))}
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
