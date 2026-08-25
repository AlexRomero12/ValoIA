'use client';

import { tierName } from '@/lib/metas';
import type { MatchRow } from '@/lib/types';

interface TierChartProps {
  matchesAsc: MatchRow[];
}

export function TierChart({ matchesAsc }: TierChartProps) {
  if (!matchesAsc.length) return <p className="empty">Sin competitivas en esta ventana.</p>;

  const FLOOR = 15;
  const tiers = matchesAsc.map((m) => m.tier || 3);
  const minT = Math.max(FLOOR, Math.min(...tiers) - 1);
  const maxT = Math.min(28, Math.max(...tiers) + 1);
  const W = 940, H = 250, PL = 88, PR = 18, PT = 18, PB = 32;
  const cw = W - PL - PR;
  const ch = H - PT - PB;
  const xAt = (i: number) => PL + (matchesAsc.length === 1 ? cw / 2 : (i / (matchesAsc.length - 1)) * cw);
  const yAt = (t: number) => Math.min(PT + ch - ((t - minT) / Math.max(1, maxT - minT)) * ch, PT + ch);

  const gridlines = [];
  for (let t = minT; t <= maxT; t++) {
    const y = yAt(t);
    const major = t === 15 || t === 18 || t === 21 || t === 24 || t >= 27;
    gridlines.push(
      <g key={t}>
        <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#20303f" strokeWidth={major ? 1.3 : 0.7} opacity={major ? 1 : 0.6} />
        {tierName(t) !== '—' && (
          <text x={PL - 12} y={y + 3.5} fontSize="10" fill={major ? '#93a4b3' : '#5d7080'} textAnchor="end">
            {tierName(t)}
          </text>
        )}
      </g>,
    );
  }

  const pathPts = matchesAsc.map((m, i) => `${xAt(i).toFixed(1)} ${yAt(m.tier || 3).toFixed(1)}`);
  const areaPath = `M${pathPts[0]} L${pathPts.join(' L')} L${xAt(matchesAsc.length - 1).toFixed(1)} ${(PT + ch).toFixed(1)} L${xAt(0).toFixed(1)} ${(PT + ch).toFixed(1)} Z`;

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
        <path d={areaPath} fill="url(#area)" stroke="none" />
        <path d={`M${pathPts.join(' L')}`} fill="none" stroke="#ff4655" strokeWidth="2" strokeLinejoin="round" />
        {matchesAsc.map((m, i) => {
          const cx = xAt(i);
          const cy = yAt(m.tier || 3);
          const col = m.won ? '#2fd08a' : '#ff5c69';
          const d = new Date(m.timestamp);
          const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
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
              <text x={cx} y={H - PB + 18} fontSize="9" fill="#5d7080" textAnchor="middle">{label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
