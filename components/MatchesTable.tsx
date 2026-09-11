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
  /** Filtros activos, controlados desde el padre (también los paneles de winrate filtran) */
  fMap: string | null;
  fAgent: string | null;
  onFilter: (kind: 'map' | 'agent', value: string | null) => void;
}

export function MatchesTable({ matches, playerId, canLoadMore, onLoadMore, fMap, fAgent, onFilter }: MatchesTableProps) {
  const [selected, setSelected] = useState<MatchRow | null>(null);
  const [openDays, setOpenDays] = useState<string[]>([]);
  const [analysisDay, setAnalysisDay] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const rows = matches.filter((m) => (!fMap || m.map === fMap) && (!fAgent || m.agent === fAgent));

  const days = useMemo(() => groupByDay(rows), [rows]);
  const totalPages = Math.max(1, Math.ceil(days.length / DAYS_PER_PAGE));
  const activePage = Math.min(page, totalPages - 1);
  const pageDays = days.slice(activePage * DAYS_PER_PAGE, activePage * DAYS_PER_PAGE + DAYS_PER_PAGE);

  const toggle = (kind: 'map' | 'agent', value: string) =>
    onFilter(kind, (kind === 'map' ? fMap : fAgent) === value ? null : value);

  const toggleDay = (key: string) =>
    setOpenDays((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));

  return (
    <div className="panel">
      <h2>Partidas recientes</h2>

      {(fMap || fAgent) && (
        <div className="filter-bar">
          <span>Filtro:</span>
          {fMap && (
            <button className="f-chip" onClick={() => onFilter('map', null)}>
              Mapa: <b>{esc(fMap)}</b> ✕
            </button>
          )}
          {fAgent && (
            <button className="f-chip" onClick={() => onFilter('agent', null)}>
              Agente: <b>{esc(fAgent)}</b> ✕
            </button>
          )}
          {fMap && fAgent && (
            <button
              className="f-chip"
              onClick={() => { onFilter('map', null); onFilter('agent', null); }}
            >
              Limpiar todo ✕
            </button>
          )}
        </div>
      )}

      <div className="table-scroll matches-desktop">
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
                const expanded = openDays.includes(g.key);
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
                            toggleDay(g.key);
                          }}
                        >
                          ▸
                        </span>
                        <span className="day-label">{esc(st.label)}</span>
                        <span className="day-meta">
                          {st.matches} partida{st.matches !== 1 ? 's' : ''} ·{' '}
                          <b className={st.wins >= st.losses ? 'd-win' : 'd-loss'}>
                            {st.wins}V-{st.losses}D{st.draws > 0 ? `-${st.draws}E` : ''}
                          </b>
                          {' '}· KD {st.kd.toFixed(2)} · ACS {st.acs} · ADR {st.adr}
                        </span>
                        <span
                          className={`day-rr ${st.rrTotal != null && st.rrTotal < 0 ? 'down' : 'up'}`}
                          title={st.rrMissing > 0 ? `RR de ${st.matches - st.rrMissing}/${st.matches} partidas (${st.rrMissing} sin dato)` : undefined}
                        >
                          {st.rrTotal != null ? `${st.rrTotal > 0 ? '+' : ''}${st.rrTotal}${st.rrMissing > 0 ? '~' : ''} RR` : ''}
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

      <div className="matches-cards">
        {!matches.length ? (
          <p className="empty">Juega una competitiva y aparecerá aquí.</p>
        ) : !rows.length ? (
          <p className="empty">Ninguna partida cumple el filtro activo.</p>
        ) : (
          pageDays.map((g) => {
            const st = dayStats(g);
            const expanded = openDays.includes(g.key);
            return (
              <section key={g.key} className="mc-day">
                <div className="mc-day-head">
                  <button className="mc-day-btn" onClick={() => setAnalysisDay(g.key)} title="Ver análisis del día">
                    <span className="day-label">{esc(st.label)}</span>
                    <span className="day-meta">
                      {st.matches}p ·{' '}
                      <b className={st.wins >= st.losses ? 'd-win' : 'd-loss'}>
                        {st.wins}V-{st.losses}D{st.draws > 0 ? `-${st.draws}E` : ''}
                      </b>{' '}
                      · KD {st.kd.toFixed(2)}
                    </span>
                    <span className={`day-rr ${st.rrTotal != null && st.rrTotal < 0 ? 'down' : 'up'}`}>
                      {st.rrTotal != null ? `${st.rrTotal > 0 ? '+' : ''}${st.rrTotal}${st.rrMissing > 0 ? '~' : ''} RR` : ''}
                    </span>
                  </button>
                  <button
                    className={`mc-chevron${expanded ? ' on' : ''}`}
                    aria-label={expanded ? 'Contraer día' : 'Expandir día'}
                    onClick={() => toggleDay(g.key)}
                  >
                    ▸
                  </button>
                </div>
                {expanded ? g.matches.map((m) => <MatchCard key={m.matchId} m={m} onSelect={() => setSelected(m)} />) : null}
              </section>
            );
          })
        )}
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
          key={analysisDay}
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
        {m.accountTag ? (
          <span className="acct-tag" title={`${m.accountName ?? ''}#${m.accountTag}`}>#{m.accountTag}</span>
        ) : null}
      </td>
      <td>
        <span className={`res-badge ${isDraw(m) ? 'e' : m.won ? 'w' : 'l'}`}>
          {isDraw(m) ? 'Empate' : m.won ? 'Victoria' : 'Derrota'}
        </span>
      </td>
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

/** Tarjeta de partida para móvil (≤720px). Mantiene el tap → detalle. */
function MatchCard({ m, onSelect }: { m: MatchRow; onSelect: () => void }) {
  const d = new Date(m.timestamp);
  const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const kd = (m.kills / Math.max(1, m.deaths)).toFixed(2);
  const draw = isDraw(m);
  const rr = m.rrDelta;
  return (
    <button className="match-card" onClick={onSelect} title="Ver detalle de la partida">
      <span className={`mc-badge ${draw ? 'e' : m.won ? 'w' : 'l'}`}>{draw ? 'E' : m.won ? 'V' : 'D'}</span>
      <span className="mc-main">
        <span className="mc-line1">
          {m.mapIcon ? <img className="map-icon" src={m.mapIcon} alt="" loading="lazy" /> : null}
          <b>{esc(m.map)}</b>
          <span className="mc-dot">·</span>
          {m.agentIcon ? <img className="agent-icon" src={m.agentIcon} alt="" loading="lazy" /> : null}
          {esc(m.agent)}
        </span>
        <span className="mc-line2">
          <b className="mc-score">{m.roundsWon}–{m.roundsLost}</b>
          <span className="mc-dot">·</span>
          {m.kills}/{m.deaths}/{m.assists}
          <span className="mc-dot">·</span>
          KD <b className={parseFloat(kd) >= 1.05 ? 'stat-ok' : ''}>{kd}</b>
        </span>
      </span>
      <span className="mc-side">
        <span className={`mc-acs${m.acs >= 220 ? ' stat-ok' : ''}`}>{m.acs} <i>ACS</i></span>
        <span className="mc-sub">ADR {m.adr} · HS {m.hsPct.toFixed(1)}%</span>
        <span className={`mc-rr${rr == null ? '' : rr > 0 ? ' up' : rr < 0 ? ' down' : ''}`}>
          {rr == null ? `${hora} · sin RR` : `${hora} · ${rr > 0 ? '+' : ''}${rr} RR`}
        </span>
      </span>
    </button>
  );
}

/** Empate: marcador igualado (p. ej. 14-14). No cuenta como derrota. */
function isDraw(m: MatchRow): boolean {
  return m.roundsWon === m.roundsLost;
}
