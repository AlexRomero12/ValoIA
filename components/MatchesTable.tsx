'use client';

import { useMemo, useState } from 'react';
import { esc } from '@/lib/metas';
import { groupByDay, dayStats } from '@/lib/dayAnalysis';
import type { MatchRow } from '@/lib/types';
import { MatchDetailModal } from './MatchDetailModal';
import { DayDetailModal } from './DayDetailModal';

const DAYS_PER_PAGE = 5;

interface MatchesTableProps {
  matches: MatchRow[];
  playerId?: string;
  /** Muestra botón "Cargar más" si hay más historial por descargar */
  canLoadMore?: boolean;
  /** Solicita más historial (crece limit 10 -> 20 -> 40) */
  onLoadMore?: () => void;
}

export function MatchesTable({ matches, playerId, canLoadMore, onLoadMore }: MatchesTableProps) {
  const [fMap, setFMap] = useState<string | null>(null);
  const [fAgent, setFAgent] = useState<string | null>(null);
  const [selected, setSelected] = useState<MatchRow | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [analysisDay, setAnalysisDay] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const rows = matches.filter((m) => (!fMap || m.map === fMap) && (!fAgent || m.agent === fAgent));

  const days = useMemo(() => groupByDay(rows), [rows]);
  const totalPages = Math.max(1, Math.ceil(days.length / DAYS_PER_PAGE));
  const activePage = Math.min(page, totalPages - 1);
  const pageDays = days.slice(activePage * DAYS_PER_PAGE, activePage * DAYS_PER_PAGE + DAYS_PER_PAGE);

  const toggle = (kind: 'map' | 'agent', value: string) => {
    if (kind === 'map') setFMap(fMap === value ? null : value);
    else setFAgent(fAgent === value ? null : value);
  };

  return (
    <div className="panel">
      <h2>Partidas recientes</h2>

      {(fMap || fAgent) && (
        <div className="filter-bar">
          <span>Filtro:</span>
          {fMap && (
            <button className="f-chip" onClick={() => setFMap(null)}>
              Mapa: <b>{esc(fMap)}</b> ✕
            </button>
          )}
          {fAgent && (
            <button className="f-chip" onClick={() => setFAgent(null)}>
              Agente: <b>{esc(fAgent)}</b> ✕
            </button>
          )}
          {fMap && fAgent && (
            <button
              className="f-chip"
              onClick={() => { setFMap(null); setFAgent(null); }}
            >
              Limpiar todo ✕
            </button>
          )}
        </div>
      )}

      <div className="table-scroll">
        <table className="matches">
          <colgroup>
            <col style={{ width: '12%' }} /><col style={{ width: '12%' }} /><col style={{ width: '13%' }} /><col style={{ width: '12%' }} />
            <col style={{ width: '8%' }} /><col style={{ width: '10%' }} /><col style={{ width: '6%' }} /><col style={{ width: '7%' }} />
            <col style={{ width: '6%' }} /><col style={{ width: '6%' }} /><col style={{ width: '8%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Hora</th><th>Mapa</th><th>Agente</th><th>Resultado</th><th className="num">Marcador</th>
              <th className="num">K/D/A</th><th className="num">K/D</th><th className="num">ACS</th><th className="num">ADR</th>
              <th className="num">HS%</th><th className="num">RR</th>
            </tr>
          </thead>
          <tbody>
            {!matches.length ? (
              <tr><td colSpan={11}><p className="empty">Juega una competitiva y aparecerá aquí.</p></td></tr>
            ) : !rows.length ? (
              <tr><td colSpan={11}><p className="empty">Ninguna partida cumple el filtro activo.</p></td></tr>
            ) : (
              pageDays.flatMap((g) => {
                const st = dayStats(g);
                const expanded = openDay === g.key;
                const head = (
                  <tr key={`day-${g.key}`} className="day-row">
                    <td colSpan={11}>
                      <button
                        className="day-head"
                        title="Ver análisis del día"
                        onClick={() => setAnalysisDay(g.key)}
                      >
                        <span
                          className={`day-chevron${expanded ? ' on' : ''}`}
                          role="button"
                          aria-label={expanded ? 'Contraer día' : 'Expandir día'}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenDay(expanded ? null : g.key);
                          }}
                        >
                          ▸
                        </span>
                        <span className="day-label">{esc(st.label)}</span>
                        <span className="day-meta">
                          {st.matches} partida{st.matches !== 1 ? 's' : ''} ·{' '}
                          <b className={st.wins >= st.losses ? 'd-win' : 'd-loss'}>{st.wins}V-{st.losses}D</b>
                          {' '}· KD {st.kd.toFixed(2)} · ACS {st.acs} · ADR {st.adr}
                        </span>
                        <span className={`day-rr ${st.rrTotal != null && st.rrTotal < 0 ? 'down' : 'up'}`}>
                          {st.rrTotal != null ? `${st.rrTotal > 0 ? '+' : ''}${st.rrTotal} RR` : ''}
                        </span>
                      </button>
                    </td>
                  </tr>
                );
                if (!expanded) return [head];
                return [
                  head,
                  ...g.matches.map((m) => <MatchRowEl key={m.matchId} m={m} fMap={fMap} fAgent={fAgent} onSelect={() => setSelected(m)} toggle={toggle} />),
                ];
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="page-controls">
          <button className="f-chip" disabled={activePage === 0} onClick={() => setPage(activePage - 1)} aria-label="Página anterior">
            ‹ Anterior
          </button>
          <span className="page-info">Página {activePage + 1} de {totalPages}</span>
          <button className="f-chip" disabled={activePage >= totalPages - 1} onClick={() => setPage(activePage + 1)} aria-label="Página siguiente">
            Siguiente ›
          </button>
        </div>
      )}

      {canLoadMore && onLoadMore && (
        <div className="filter-bar" style={{ justifyContent: 'center', marginTop: 8 }}>
          <button className="f-chip" onClick={onLoadMore}>
            Cargar más partidas
          </button>
        </div>
      )}

      {selected && <MatchDetailModal match={selected} playerId={playerId} onClose={() => setSelected(null)} />}
      {analysisDay && (
        <DayDetailModal
          day={dayStats(days.find((g) => g.key === analysisDay)!)}
          onClose={() => setAnalysisDay(null)}
        />
      )}
    </div>
  );
}

function MatchRowEl({ m, fMap, fAgent, onSelect, toggle }: {
  m: MatchRow;
  fMap: string | null;
  fAgent: string | null;
  onSelect: () => void;
  toggle: (kind: 'map' | 'agent', value: string) => void;
}) {
  const d = new Date(m.timestamp);
  const fecha = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const kd = (m.kills / Math.max(1, m.deaths)).toFixed(2);
  const okCls = (v: number, target: number) => (v >= target ? ' stat-ok' : '');
  const rr = m.rrDelta;
  return (
    <tr className="clickable-row" onClick={onSelect} title="Ver detalle de la partida">
      <td className="date">{fecha}</td>
      <td>
        <span
          className={`icon-cell clickable${fMap === m.map ? ' filter-on' : ''}`}
          title={`Filtrar por ${m.map}`}
          onClick={(e) => { e.stopPropagation(); toggle('map', m.map); }}
        >
          {m.mapIcon ? <img className="map-icon" src={m.mapIcon} alt="" loading="lazy" /> : null}
          {esc(m.map)}
        </span>
      </td>
      <td className="agent">
        <span
          className={`icon-cell clickable${fAgent === m.agent ? ' filter-on' : ''}`}
          title={`Filtrar por ${m.agent}`}
          onClick={(e) => { e.stopPropagation(); toggle('agent', m.agent); }}
        >
          {m.agentIcon ? <img className="agent-icon" src={m.agentIcon} alt="" loading="lazy" /> : null}
          {esc(m.agent)}
        </span>
      </td>
      <td><span className={`res-badge ${m.won ? 'w' : 'l'}`}>{m.won ? 'Victoria' : 'Derrota'}</span></td>
      <td className="num score">{m.roundsWon}–{m.roundsLost}</td>
      <td className="num">{m.kills}/{m.deaths}/{m.assists}</td>
      <td className={`num${okCls(parseFloat(kd), 1.05)}`}>{kd}</td>
      <td className={`num${okCls(m.acs, 220)}`}>{m.acs}</td>
      <td className={`num${okCls(m.adr, 150)}`}>{m.adr}</td>
      <td className={`num${okCls(m.hsPct, 25)}`}>{m.hsPct.toFixed(1)}</td>
      <td className={`num rr-cell${rr == null ? '' : rr > 0 ? ' rr-up' : rr < 0 ? ' rr-down' : ''}`} title={rr != null ? `RR en rango: ${m.rr ?? '—'}` : undefined}>
        {rr == null ? '—' : `${rr > 0 ? '+' : ''}${rr}`}
      </td>
    </tr>
  );
}
