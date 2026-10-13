'use client';

import { useMemo, useState } from 'react';
import { InfoTip } from '@/components/InfoTip';
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
  /** Nivel de maestría que guarda Riot (0–5). Solo lo llena la vista de agentes. */
  level?: number | null;
}

/** Cifras del champ pool que acompañan a la columna Maestría. */
export interface MasterySummary {
  /** Agentes con nivel ≥ 1 (lo que Riot considera trabajado, no la ventana). */
  withLevel: number;
  /** Suma de niveles de todos los agentes. */
  total: number;
  /** Agentes jugados en la ventana que siguen en nivel 0. */
  noLevel: number;
  /** El endpoint todavía no respondió (la columna va en «—»). */
  pending?: boolean;
  /** El endpoint falló: se dice en la ayuda en vez de mentir con ceros. */
  error?: string | null;
}

export interface TopAgent {
  agent: string;
  icon: string | null;
  wins: number;
}

type SortKey = 'matches' | 'wr' | 'kd' | 'acs' | 'adr' | 'hsPct' | 'level';

const COLS: { key: SortKey; label: string }[] = [
  { key: 'matches', label: 'PJ' },
  { key: 'wr', label: 'WR%' },
  { key: 'kd', label: 'K/D' },
  { key: 'acs', label: 'ACS' },
  { key: 'adr', label: 'ADR' },
  { key: 'hsPct', label: 'HS%' },
];

/**
 * Nivel de maestría de Riot, como número suelto. Sin pips ni barra: el nivel
 * **no tiene tope** (Riot lo sigue subiendo con el uso; comprobado con un 6),
 * así que cualquier denominador fijo mentiría sobre la escala. Sin nivel se
 * pinta un guion.
 */
function MasteryCell({ level }: { level: number }) {
  if (!level) return <span className="mastery-none">—</span>;
  return <span className="mastery-lv">{level}</span>;
}

/** Resumen del champ pool en la línea de ayuda (cargando / error / cifras). */
function MasteryNote({ m }: { m: MasterySummary }) {
  if (m.error) return <> Maestría no disponible: {m.error}.</>;
  if (m.pending) return <> Maestría: cargando…</>;
  return (
    <>
      {' '}Maestría: <b>{m.withLevel}</b> con nivel · <b>{m.total}</b> niveles
      {m.noLevel > 0 ? <> · <b>{m.noLevel}</b> jugados sin maestría</> : null}.
    </>
  );
}

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
  /** Solo vista de mapas: agente con más victorias en cada mapa. */
  topAgents?: Map<string, TopAgent>;
  /**
   * Solo vista de agentes: activa la columna Maestría (pips 0–5 + nivel) y
   * resume el champ pool en la línea de ayuda.
   */
  mastery?: MasterySummary | null;
  /** Cuántas partidas quedan con la selección actual (para el botón de ver). */
  filteredCount: number;
  /** Vuelve al historial del Resumen con la selección aplicada. */
  onViewHistory: () => void;
}

/** Tabla completa y ordenable de Agentes/Mapas; click en fila alterna el filtro. */
export function StatsTable({ title, firstCol, noun, rows, icons, kind, active, onPick, topAgents, mastery, filteredCount, onViewHistory }: StatsTableProps) {
  const [sort, setSort] = useState<SortKey>('matches');
  const [asc, setAsc] = useState(false);

  const sorted = useMemo(() => {
    const val = (r: StatsRow, k: SortKey): number => (k === 'level' ? r.level ?? 0 : r[k]);
    return [...rows].sort((a, b) => {
      const dir = asc ? 1 : -1;
      return (val(a, sort) - val(b, sort)) * dir || b.matches - a.matches;
    });
  }, [rows, sort, asc]);

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
        {mastery ? (
          <span className="mastery-sums">
            <MasteryNote m={mastery} />
          </span>
        ) : null}
      </p>
      {!rows.length ? (
        <p className="empty">Juega competitivas en esta ventana para ver datos aquí.</p>
      ) : (
        <div className="table-scroll">
          <table className="score-table stats-table">
            <thead>
              <tr>
                <th>{firstCol}</th>
                {mastery ? (
                  <th
                    className={`sortable${sort === 'level' ? ' on' : ''}`}
                    onClick={() => toggle('level')}
                    title="Ordenar por nivel de maestría"
                  >
                    Maestría{sort === 'level' ? (asc ? ' ▲' : ' ▼') : ''}
                    <InfoTip text="Nivel de maestría que Riot guarda por agente: sube con las horas que juegas cada agente, no mide lo bien que lo juegas. No tiene tope publicado, así que va como número suelto; — es que Riot todavía no le dio nivel." />
                  </th>
                ) : null}
                {topAgents ? <th className="num">Agente top</th> : null}
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
                const top = topAgents?.get(r.name);
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
                    {mastery ? (
                      <td className="mastery-td">
                        <MasteryCell level={r.level ?? 0} />
                      </td>
                    ) : null}
                    {topAgents ? (
                      <td className="num">
                        {top ? (
                          <span className="top-agent" title={`${top.agent} · ${top.wins}V en este mapa`}>
                            {top.icon ? <img className="agent-icon" src={top.icon} alt={top.agent} loading="lazy" /> : null}
                            <span className="top-agent-wins">{top.wins}V</span>
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    ) : null}
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
