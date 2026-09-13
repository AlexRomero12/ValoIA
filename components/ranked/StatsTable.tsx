'use client';

import { useMemo, useState } from 'react';
import { esc, wrColor } from '@/lib/metas';

export interface StatsRow {
  name: string;
  matches: number;
  wins: number;
  draws?: number;
  wr: number;
  kd: number;
  acs: number;
  adr: number;
  hsPct: number;
}

type SortKey = 'matches' | 'wr' | 'kd' | 'acs' | 'adr' | 'hsPct';

const COLS: { key: SortKey; label: string }[] = [
  { key: 'matches', label: 'PJ' },
  { key: 'wr', label: 'WR%' },
  { key: 'kd', label: 'K/D' },
  { key: 'acs', label: 'ACS' },
  { key: 'adr', label: 'ADR' },
  { key: 'hsPct', label: 'HS%' },
];

interface StatsTableProps {
  title: string;
  /** Encabezado de la primera columna (Agente/Mapa). */
  firstCol: string;
  /** Sustantivo para tooltips: "agente" | "mapa". */
  noun: string;
  rows: StatsRow[];
  icons: Map<string, string | null>;
  kind: 'agent-icon' | 'map-icon';
  /** Filas seleccionadas para el filtro del historial (multi). */
  active: string[];
  onPick: (name: string) => void;
  /** Cuántas partidas quedan con la selección actual (para el botón de ver). */
  filteredCount: number;
  /** Vuelve al historial del Resumen con la selección aplicada. */
  onViewHistory: () => void;
}

/** Tabla completa y ordenable de Agentes/Mapas; click en fila alterna el filtro. */
export function StatsTable({ title, firstCol, noun, rows, icons, kind, active, onPick, filteredCount, onViewHistory }: StatsTableProps) {
  const [sort, setSort] = useState<SortKey>('matches');
  const [asc, setAsc] = useState(false);

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const dir = asc ? 1 : -1;
        return (a[sort] - b[sort]) * dir || b.matches - a.matches;
      }),
    [rows, sort, asc],
  );

  const toggle = (key: SortKey) => {
    if (key === sort) setAsc((v) => !v);
    else {
      setSort(key);
      setAsc(false);
    }
  };

  return (
    <div className="panel">
      <h2>{title}</h2>
      <p className="wr-hint">
        Ordena por cualquier columna; toca filas para añadirlas o quitarlas del filtro del historial.
      </p>
      {!rows.length ? (
        <p className="empty">Juega competitivas en esta ventana para ver datos aquí.</p>
      ) : (
        <div className="table-scroll">
          <table className="score-table stats-table">
            <thead>
              <tr>
                <th>{firstCol}</th>
                <th className="num">Récord</th>
                {COLS.map((c) => (
                  <th
                    key={c.key}
                    className={`num sortable${sort === c.key ? ' on' : ''}`}
                    onClick={() => toggle(c.key)}
                    title={`Ordenar por ${c.label}`}
                  >
                    {c.label}{sort === c.key ? (asc ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const draws = r.draws ?? 0;
                const losses = r.matches - r.wins - draws;
                const icon = icons.get(r.name);
                return (
                  <tr
                    key={r.name}
                    className={`clickable-row${active.includes(r.name) ? ' row-on' : ''}`}
                    title={`Añadir o quitar ${r.name} del filtro`}
                    onClick={() => onPick(r.name)}
                  >
                    <td>
                      <span className="icon-cell">
                        {icon ? <img className={kind} src={icon} alt="" loading="lazy" /> : null}
                        {esc(r.name)}
                      </span>
                    </td>
                    <td className="num">
                      {r.wins}V–{losses}D{draws > 0 ? `–${draws}E` : ''}
                    </td>
                    <td className="num">{r.matches}</td>
                    <td className="num" style={{ color: wrColor(r.wr) }}>{r.wr.toFixed(0)}%</td>
                    <td className={`num${r.kd >= 1.05 ? ' stat-ok' : ''}`}>{r.kd.toFixed(2)}</td>
                    <td className="num">{r.acs}</td>
                    <td className="num">{r.adr}</td>
                    <td className="num">{r.hsPct.toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {active.length > 0 ? (
        <div className="filter-bar" style={{ justifyContent: 'center', marginTop: 10 }}>
          <button className="f-chip" onClick={onViewHistory}>
            Ver partidas ({filteredCount}) →
          </button>
          <span className="window-info">
            {active.length} {noun}{active.length === 1 ? '' : 's'} en el filtro
          </span>
        </div>
      ) : null}
    </div>
  );
}
