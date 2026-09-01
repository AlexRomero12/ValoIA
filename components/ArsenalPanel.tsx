'use client';

import { useState } from 'react';
import { esc } from '@/lib/metas';
import type { ValArsenal } from '@/lib/types';

const TOP_N = 5;

export function ArsenalPanel({ arsenal }: { arsenal?: ValArsenal }) {
  const [expanded, setExpanded] = useState(false);
  if (!arsenal) return null;

  const hidden = Math.max(0, arsenal.rows.length - TOP_N);
  const visible = expanded ? arsenal.rows : arsenal.rows.slice(0, TOP_N);

  return (
    <div className="panel">
      <h2>Arsenal · Uso de armas</h2>
      {!arsenal.totalKills ? (
        <p className="empty">Sin datos de armas en esta ventana.</p>
      ) : (
        <>
          <div className="wr-list">
            <div className="wr-head"><span>Arma</span><span>Uso</span><span>Kills · K/D</span></div>
            {visible.map((r) => (
              <div
                key={r.weapon}
                className="wr-row ars"
                title={`${r.weapon}${r.type ? ` (${r.type})` : ''} — ${r.kills} kills · K/D ${r.kd.toFixed(2)} · ${r.firstBloods} primeras sangre`}
              >
                <span className="wr-name">
                  {r.icon ? <img className="ars-icon" src={r.icon} alt="" loading="lazy" /> : null}
                  {esc(r.weapon)}
                  {r.type ? <small className="ars-type">{esc(r.type)}</small> : null}
                </span>
                <div className="wr-track">
                  <div
                    className="wr-fill"
                    style={{
                      width: `${Math.max(3, Math.min(100, (r.kills / arsenal.totalKills) * 100))}%`,
                      background: 'var(--red)',
                    }}
                  />
                </div>
                <div className="wr-meta">
                  <div className="wr-pct" style={{ color: r.kd >= 1 ? 'var(--win)' : 'var(--loss)' }}>{r.kills}</div>
                  <div className="wr-sub">
                    {((r.kills / arsenal.totalKills) * 100).toFixed(0)}% · K/D {r.kd.toFixed(2)} · PB {r.firstBloods}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {hidden > 0 && (
            <div className="filter-bar" style={{ justifyContent: 'center', marginTop: 8 }}>
              <button className="f-chip" onClick={() => setExpanded(!expanded)}>
                {expanded ? 'Ver menos' : `Ver más (${hidden} armas más)`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
