'use client';

import { useState } from 'react';
import { esc } from '@/lib/metas';
import type { MatchRow } from '@/lib/types';
import { MatchDetailModal } from './MatchDetailModal';

interface MatchesTableProps {
  matches: MatchRow[];
  playerId?: string;
}

export function MatchesTable({ matches, playerId }: MatchesTableProps) {
  const [fMap, setFMap] = useState<string | null>(null);
  const [fAgent, setFAgent] = useState<string | null>(null);
  const [selected, setSelected] = useState<MatchRow | null>(null);

  const rows = matches.filter((m) => (!fMap || m.map === fMap) && (!fAgent || m.agent === fAgent));

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
              <th>Fecha</th><th>Mapa</th><th>Agente</th><th>Resultado</th><th className="num">Marcador</th>
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
              rows.map((m) => {
                const d = new Date(m.timestamp);
                const fecha = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                const kd = (m.kills / Math.max(1, m.deaths)).toFixed(2);
                const okCls = (v: number, target: number) => (v >= target ? ' stat-ok' : '');
                const rr = m.rrDelta;
                return (
                  <tr key={m.matchId} className="clickable-row" onClick={() => setSelected(m)} title="Ver detalle de la partida">
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
              })
            )}
          </tbody>
        </table>
      </div>

      {selected && <MatchDetailModal match={selected} playerId={playerId} onClose={() => setSelected(null)} />}
    </div>
  );
}


