'use client';

import { esc } from '@/lib/metas';
import type { Granularity, MetricKey, CompareFilters } from '@/lib/compare';
import { AgentIconFilter } from './AgentIconFilter';

interface FiltersBarProps {
  win: WindowValue;
  onWin: (v: WindowValue) => void;
  filters: CompareFilters;
  onFilters: (f: CompareFilters) => void;
  onToggleAgent: (name: string) => void;
  agents: string[];
  maps: string[];
  gran: Granularity;
  onGran: (g: Granularity) => void;
  metric: MetricKey;
  onMetric: (m: MetricKey) => void;
}

export type WindowValue = 'season' | '7' | '14' | '30' | '90' | '365';

const METRICS: { key: MetricKey; label: string }[] = [
  { key: 'wr', label: 'WR%' },
  { key: 'acs', label: 'ACS' },
  { key: 'kd', label: 'K/D' },
  { key: 'elo', label: 'ELO' },
];

export function FiltersBar(p: FiltersBarProps) {
  const f = p.filters;
  return (
    <div className="controls compare-controls">
      <div className="ctl-group">
        <label>Ventana</label>
        <select value={p.win} onChange={(e) => p.onWin(e.target.value as WindowValue)}>
          <option value="season">Temporada actual</option>
          <option value="7">7 días</option>
          <option value="14">14 días</option>
          <option value="30">30 días</option>
          <option value="90">90 días</option>
        </select>
      </div>

      <div className="ctl-group">
        <label>Rango custom</label>
        <span className="inline-pair">
          <input type="date" className="date-input" value={f.from} onChange={(e) => p.onFilters({ ...f, from: e.target.value })} />
          <span className="sep">→</span>
          <input type="date" className="date-input" value={f.to} onChange={(e) => p.onFilters({ ...f, to: e.target.value })} />
        </span>
      </div>

      <div className="ctl-group">
        <label>Mapa</label>
        <select value={f.map} onChange={(e) => p.onFilters({ ...f, map: e.target.value })}>
          <option value="">Todos</option>
          {p.maps.map((mp) => <option key={mp} value={mp}>{mp}</option>)}
        </select>
      </div>

      <div className="ctl-group">
        <label>Granularidad</label>
        <select value={p.gran} onChange={(e) => p.onGran(e.target.value as Granularity)}>
          <option value="day">Por día</option>
          <option value="week">Por semana</option>
        </select>
      </div>

      <div className="ctl-group">
        <label>Métrica</label>
        <select value={p.metric} onChange={(e) => p.onMetric(e.target.value as MetricKey)}>
          {METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
      </div>

      <div className="ctl-group">
        <label>Mín. partidas</label>
        <input
          type="number"
          className="date-input num-sm"
          min={0}
          max={50}
          value={f.minGames}
          onChange={(e) => p.onFilters({ ...f, minGames: Math.max(0, Number(e.target.value) || 0) })}
        />
      </div>

      {(f.agents.length > 0 || f.map || f.from || f.to || f.minGames > 0) && (
        <button
          className="f-chip"
          onClick={() => p.onFilters({ agents: [], map: '', from: '', to: '', minGames: 0 })}
        >
          Limpiar filtros ✕
        </button>
      )}

      <div className="ctl-agents">
        <label>Agentes{f.agents.length ? ` · ${f.agents.length} seleccionados` : ' · todos'}</label>
        <AgentIconFilter available={p.agents} selected={f.agents} onToggle={p.onToggleAgent} />
      </div>
    </div>
  );
}

export { esc };
