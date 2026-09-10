'use client';

import { tierName } from '@/lib/metas';
import { pickXMarks } from '@/lib/chartAxis';
import { useTierIcons } from '@/lib/hooks';
import type { MatchRow } from '@/lib/types';

interface TierChartProps {
  matchesAsc: MatchRow[];
}

export function TierChart({ matchesAsc }: TierChartProps) {
  const tierIcons = useTierIcons().data ?? {};
  if (!matchesAsc.length) return <p className="empty">Sin competitivas en esta ventana.</p>;

  const validTiers = matchesAsc.map((m) => m.tier).filter((t): t is number => typeof t === 'number' && t > 0);
  // Eje dinámico sobre tiers reales: sin piso fijo (aplanaba caídas bajo P1)
  // y sin fabricar Iron 1 para partidas Unrated (tier 0).
  const lo = validTiers.length ? Math.min(...validTiers) : 15;
  const hi = validTiers.length ? Math.max(...validTiers) : 18;
  const minT = lo - 1;
  const maxT = hi + 1;
  const W = 940, H = 250, PL = 88, PR = 18, PT = 18, PB = 32;
  const cw = W - PL - PR;
  const ch = H - PT - PB;
  const xAt = (i: number) => PL + (matchesAsc.length === 1 ? cw / 2 : (i / (matchesAsc.length - 1)) * cw);
  // yOf: null para tiers desconocidos (Unrated); la cuadrícula cae al fondo.
  const yOf = (t: number): number | null => {
    if (!(t > 0)) return null;
    return PT + ch - ((t - minT) / Math.max(1, maxT - minT)) * ch;
  };

  const gridlines = [];
  for (let t = minT; t <= maxT; t++) {
    const y = yOf(t) ?? PT + ch;
    const major = t === 15 || t === 18 || t === 21 || t === 24 || t >= 27;
    gridlines.push(
      <g key={t}>
        <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#20303f" strokeWidth={major ? 1.3 : 0.7} opacity={major ? 1 : 0.6} />
        {tierName(t) !== '—' && (
          tierIcons[String(t)] ? (
            <image key={t} x={PL - 30} y={y - 9} width="20" height="20" href={tierIcons[String(t)]}>
              <title>{tierName(t)}</title>
            </image>
          ) : (
            <text x={PL - 12} y={y + 3.5} fontSize="10" fill={major ? '#93a4b3' : '#5d7080'} textAnchor="end">
              {tierName(t)}
            </text>
          )
        )}
      </g>,
    );
  }

  // Eje X legible: una etiqueta por día distinto (máx. ~10 repartidas),
  // no una por partida (50 fechas encimadas no se entienden). Con separación
  // mínima real en píxeles (ver lib/chartAxis.ts).
  const dayLabelOf = (ts: number): string => {
    const d = new Date(ts);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const showX = pickXMarks({
    count: matchesAsc.length,
    labelOf: (i) => dayLabelOf(matchesAsc[i].timestamp),
    plotW: cw,
  });
  const segs: string[][] = [[]];
  matchesAsc.forEach((m, i) => {
    const y = yOf(m.tier);
    if (y == null) {
      if (segs[segs.length - 1].length) segs.push([]);
      return;
    }
    segs[segs.length - 1].push(`${xAt(i).toFixed(1)} ${y.toFixed(1)}`);
  });
  const areaPath =
    segs
      .filter((s) => s.length)
      .map((s) => {
        const xs = s.map((p) => p.split(' ')[0]);
        return `M${s[0]} L${s.join(' L')} L${xs[xs.length - 1]} ${(PT + ch).toFixed(1)} L${xs[0]} ${(PT + ch).toFixed(1)} Z`;
      })
      .join(' ') || `M${xAt(0).toFixed(1)} ${(PT + ch).toFixed(1)} Z`;

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img">
        <defs>
          <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ff4655" stopOpacity="0.12" />
            <stop offset="1" stopColor="#ff4655" stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridlines}
        {areaPath && <path d={areaPath} fill="url(#area)" stroke="none" />}
        {segs
          .filter((s) => s.length > 1)
          .map((s, si) => (
            <path key={si} d={`M${s.join(' L')}`} fill="none" stroke="#ff4655" strokeWidth={2} strokeLinejoin="round" />
          ))}
        {matchesAsc.map((m, i) => {
          const cx = xAt(i);
          const cy = yOf(m.tier);
          const col = m.roundsWon === m.roundsLost ? '#e8c97a' : m.won ? '#2fd08a' : '#ff5c69';
          const label = dayLabelOf(m.timestamp);
          if (cy == null) {
            return (
              <g key={m.matchId + i}>
                <circle cx={cx} cy={PT + ch} r={4} fill="none" stroke="#5d7080" strokeWidth={1.5}>
                  <title>Sin rango (Unrated)</title>
                </circle>
                {showX.has(i) && (
                  <text x={cx} y={H - PB + 18} fontSize="9" fill="#5d7080" textAnchor="middle">{label}</text>
                )}
              </g>
            );
          }
          return (
            <g key={m.matchId + i}>
              {m.tierChange !== 0 && (
                <>
                  <circle cx={cx} cy={cy} r={7} fill="none" stroke="#e8c97a" strokeWidth={1.4} opacity={0.9} />
                  <text x={cx} y={cy - 13} fontSize="11" fill={m.tierChange > 0 ? '#e8c97a' : '#ff5c69'} textAnchor="middle">
                    {m.tierChange > 0 ? '▲' : '▼'}
                  </text>
                </>
              )}
              <circle cx={cx} cy={cy} r={4} fill={col} stroke="#0f1923" strokeWidth={1.5} />
              {showX.has(i) && (
                <text x={cx} y={H - PB + 18} fontSize="9" fill="#5d7080" textAnchor="middle">{label}</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
