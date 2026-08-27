'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { DayStats } from '@/lib/dayAnalysis';
import { esc } from '@/lib/metas';
import type { MatchRow } from '@/lib/types';

interface DayDetailModalProps {
  day: DayStats;
  onClose: () => void;
}

export function DayDetailModal({ day, onClose }: DayDetailModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const rrCls = day.rrTotal != null && day.rrTotal < 0 ? 'down' : 'up';
  const streak = streakInfo(day.rows);

  return createPortal(
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>

        <header className="md-head">
          <div className="md-title">
            <h3>
              Análisis del día · <span style={{ textTransform: 'capitalize' }}>{day.label}</span>
              <span className={`res-badge ${day.wins >= day.losses ? 'w' : 'l'}`}>
                {day.wins}V · {day.losses}D
              </span>
            </h3>
            <span className="md-sub">
              {day.matches} competitivas · {Math.floor(day.minutes / 60)}h {day.minutes % 60}m jugadas
              {streak ? ` · racha ${streak}` : ''}
            </span>
          </div>
          <div className={`md-rr ${rrCls}`}>
            {day.rrTotal != null ? `${day.rrTotal > 0 ? '+' : ''}${day.rrTotal} RR` : '—'}
          </div>
        </header>

        <section className="md-section" style={{ marginTop: 16 }}>
          <h4>Resumen</h4>
          <div className="dd-kpis">
            <Kpi label="WR del día" value={`${day.wr.toFixed(0)}%`} tone={day.wr >= 50 ? 'win' : 'loss'} />
            <Kpi label="K/D" value={day.kd.toFixed(2)} tone={day.kd >= 1 ? 'win' : 'neutral'} />
            <Kpi label="ACS" value={String(day.acs)} tone="neutral" />
            <Kpi label="ADR" value={String(day.adr)} tone="neutral" />
            <Kpi label="HS%" value={`${day.hsPct.toFixed(1)}%`} tone="neutral" />
          </div>
        </section>

        {(day.bestMatch || day.worstMatch) && (
          <section className="md-section">
            <h4>Destacadas</h4>
            <div className="combat-grid">
              {day.bestMatch && (
                <div className="combat-box">
                  <span className="cb-title">Mejor partida (ACS)</span>
                  <MatchLine m={day.bestMatch} />
                </div>
              )}
              {day.worstMatch && day.worstMatch !== day.bestMatch && (
                <div className="combat-box">
                  <span className="cb-title">Partida más difícil (ACS)</span>
                  <MatchLine m={day.worstMatch} />
                </div>
              )}
            </div>
          </section>
        )}

        {day.byAgent.length > 0 && (
          <section className="md-section">
            <h4>Por agente</h4>
            <MiniTable
              rows={day.byAgent.map((a) => ({
                key: a.name,
                label: a.name,
                icon: a.icon ?? null,
                games: a.games,
                wins: a.wins,
                losses: a.losses,
                kd: a.kd,
                acs: a.acs,
                adr: a.adr,
                hsPct: a.hsPct,
              }))}
            />
          </section>
        )}

        {day.byMap.length > 0 && (
          <section className="md-section">
            <h4>Por mapa</h4>
            <MiniTable
              rows={day.byMap.map((mp) => ({
                key: mp.name,
                label: mp.name,
                icon: mp.icon ?? null,
                games: mp.games,
                wins: mp.wins,
                losses: mp.losses,
                kd: mp.kd,
                acs: mp.acs,
                adr: mp.adr,
                hsPct: mp.hsPct,
              }))}
            />
          </section>
        )}

        <section className="md-section">
          <h4>Partidas ({day.matches})</h4>
          <div className="table-scroll">
            <table className="score-table dd-matches">
              <thead>
                <tr>
                  <th>Hora</th><th>Mapa</th><th>Agente</th><th>Resultado</th><th>Marcador</th>
                  <th>K/D/A</th><th>ACS</th><th>RR</th>
                </tr>
              </thead>
              <tbody>
                {[...day.rows].reverse().map((m) => (
                  <tr key={m.matchId}>
                    <td>{new Date(m.timestamp).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td>{esc(m.map)}</td>
                    <td>{esc(m.agent)}</td>
                    <td>
                      <span className={`res-badge ${m.won ? 'w' : 'l'}`}>{m.won ? 'Victoria' : 'Derrota'}</span>
                    </td>
                    <td className="num">{m.roundsWon}–{m.roundsLost}</td>
                    <td className="num">{m.kills}/{m.deaths}/{m.assists}</td>
                    <td className="num">{m.acs}</td>
                    <td className={`num ${m.rrDelta == null ? '' : m.rrDelta > 0 ? 'stat-win' : 'stat-loss'}`}>
                      {m.rrDelta == null ? '—' : `${m.rrDelta > 0 ? '+' : ''}${m.rrDelta}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>,
    document.body,
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'win' | 'loss' | 'neutral' }) {
  return (
    <div className={`dd-kpi${tone === 'win' ? ' win' : tone === 'loss' ? ' loss' : ''}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

function MatchLine({ m }: { m: MatchRow }) {
  return (
    <div className="dd-matchline">
      <b>{esc(m.map)}</b> con {esc(m.agent)} — {m.roundsWon}–{m.roundsLost},{' '}
      {m.kills}/{m.deaths}/{m.assists}, ACS {m.acs}
      <span className={`res-badge ${m.won ? 'w' : 'l'}`}>{m.won ? 'V' : 'D'}</span>
    </div>
  );
}

interface MiniRow {
  key: string;
  label: string;
  icon: string | null;
  games: number;
  wins: number;
  losses: number;
  kd: number;
  acs: number;
  adr: number;
  hsPct: number;
}

function MiniTable({ rows }: { rows: MiniRow[] }) {
  return (
    <div className="table-scroll">
      <table className="score-table dd-mini">
        <thead>
          <tr>
            <th></th><th>PJ</th><th>W-L</th><th>K/D</th><th>ACS</th><th>ADR</th><th>HS%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>
                <span className="icon-cell">
                  {r.icon ? <img className="agent-icon" src={r.icon} alt="" loading="lazy" /> : null}
                  {esc(r.label)}
                </span>
              </td>
              <td className="num">{r.games}</td>
              <td className="num">{r.wins}-{r.losses}</td>
              <td className={`num${r.kd >= 1 ? ' stat-ok' : ''}`}>{r.kd.toFixed(2)}</td>
              <td className="num">{r.acs}</td>
              <td className="num">{r.adr}</td>
              <td className="num">{r.hsPct.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Racha más larga de victorias o derrotas consecutivas (orden cronológico). */
function streakInfo(rows: MatchRow[]): string | null {
  const chrono = [...rows].reverse();
  if (chrono.length < 2) return null;
  let bestRun = 1;
  let bestWon = Boolean(chrono[0].won);
  let run = 1;
  let runWon = Boolean(chrono[0].won);
  for (let i = 1; i < chrono.length; i++) {
    if (Boolean(chrono[i].won) === runWon) {
      run += 1;
    } else {
      run = 1;
      runWon = !runWon;
    }
    if (run > bestRun) {
      bestRun = run;
      bestWon = runWon;
    }
  }
  if (bestRun < 2) return null;
  return bestWon ? `${bestRun}V seguidas` : `${bestRun}D seguidas`;
}
