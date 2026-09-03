'use client';

import { esc, wrColor } from '@/lib/metas';

interface WrRow {
  name: string;
  matches: number;
  wins: number;
  draws?: number;
  wr: number;
}

interface WrPanelProps {
  title?: string;
  label: 'Agente' | 'Mapa';
  rows: WrRow[];
  icons: Map<string, string | null>;
  onPick?: (name: string) => void;
  /** Fila seleccionada (resaltada) cuando el panel filtra la tabla de partidas */
  active?: string | null;
}

export function WrPanel({ title, label, rows, icons, onPick, active }: WrPanelProps) {
  const sorted = [...rows].sort((a, b) => b.matches - a.matches || b.wr - a.wr);
  const kind = label === 'Agente' ? 'agent-icon' : 'map-icon';
  const nameOf = (r: WrRow) => r.name ?? '';
  return (
    <div className="panel">
      <h2>Winrate · {label}</h2>
      {!sorted.length ? (
        <p className="empty">Juega competitivas en esta ventana para ver datos aquí.</p>
      ) : (
        <div className="wr-list">
          <div className="wr-head"><span>{label}</span><span>Distribución</span><span>WR · récord</span></div>
          {sorted.map((r) => {
            const name = nameOf(r);
            const draws = r.draws ?? 0;
            const losses = r.matches - r.wins - draws;
            const icon = icons.get(name);
            const record = `${r.wins}V–${losses}D${draws > 0 ? `–${draws}E` : ''}`;
            return (
              <div
                key={name}
                className={`wr-row${onPick ? ' pickable' : ''}${active === name ? ' on' : ''}`}
                title={`${name} — ${record}${onPick ? ' · click para filtrar Partidas recientes' : ''}`}
                onClick={onPick ? () => onPick(name) : undefined}
              >
                <span className="wr-name">
                  {icon ? <img className={kind} src={icon} alt="" loading="lazy" /> : null}
                  {esc(name)}
                </span>
                <div className="wr-track">
                  <div className="wr-fill" style={{ width: `${Math.max(3, Math.min(100, r.wr))}%`, background: wrColor(r.wr) }} />
                </div>
                <div className="wr-meta">
                  <div className="wr-pct" style={{ color: wrColor(r.wr) }}>{r.wr.toFixed(0)}%</div>
                  <div className="wr-sub">{r.matches}p · {record}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
