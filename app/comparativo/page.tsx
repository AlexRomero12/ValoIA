'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { TopBar } from '@/components/TopBar';
import { FiltersBar, type WindowValue } from '@/components/compare/FiltersBar';
import { RankingTable, type RankRow, type SortKey } from '@/components/compare/RankingTable';
import { TrendCompare } from '@/components/compare/TrendCompare';
import { AgentHeatmap } from '@/components/compare/AgentHeatmap';
import { AgentStatsTable } from '@/components/compare/AgentStatsTable';
import { useCooldown } from '@/lib/useCooldown';
import { getTeam } from '@/lib/team';
import {
  applyFilters,
  buildTimeline,
  statsFromMatches,
  unionOf,
  type CompareFilters,
  type Granularity,
  type MetricKey,
  DEFAULT_FILTERS,
} from '@/lib/compare';
import type { ValSummary } from '@/lib/types';

const TEAM = getTeam();
const COLORS: Record<string, string> = {
  alex: '#ff4655',
  nomirc: '#35b6ff',
  gengar: '#e8c97a',
  juan: '#2fd08a',
};

type WinValue = WindowValue;

export default function ComparativoPage() {
  const [win, setWin] = useState<WinValue>('season');
  const [filters, setFilters] = useState<CompareFilters>(DEFAULT_FILTERS);
  const [gran, setGran] = useState<Granularity>('week');
  const [metric, setMetric] = useState<MetricKey>('wr');
  const [sortKey, setSortKey] = useState<SortKey>('wr');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const cooldown = useCooldown(60);

  const queries = useQueries({
    queries: TEAM.map((m) => ({
      queryKey: ['compare', m.id, win],
      queryFn: async () => {
        const qs = win === 'season' ? 'season=current' : `days=${win}`;
        const res = await fetch(`/api/valorant/summary?${qs}&limit=40&player=${encodeURIComponent(m.id)}`);
        const json = await res.json();
        if (!res.ok || json.error) throw Object.assign(new Error(json.error || 'Error de red'), { code: json.code });
        return json as ValSummary;
      },
      staleTime: 10 * 60 * 1000,
    })),
  });

  const refresh = async () => {
    if (isRefreshing || cooldown.locked) return;
    setIsRefreshing(true);
    try {
      await Promise.all(
        TEAM.map((m) =>
          fetch(
            `/api/valorant/summary?${win === 'season' ? 'season=current' : `days=${win}`}&limit=40&player=${m.id}&refresh=1`,
          ),
        ),
      );
      await Promise.all(queries.map((q) => q.refetch()));
    } finally {
      setIsRefreshing(false);
      cooldown.trigger();
    }
  };

  const entries = useMemo(() => {
    return TEAM.map((m, i) => {
      const q = queries[i];
      return { member: m, data: q.data as ValSummary | undefined, error: q.error, isLoading: q.isLoading };
    });
  }, [queries]);

  const anyLoading = entries.some((e) => e.isLoading);
  const loaded = entries.filter((e) => e.data);

  const filteredPerPlayer = useMemo(
    () => entries.map((e) => applyFilters(e.data?.matches ?? [], filters)),
    [entries, filters],
  );

  const agents = useMemo(() => unionOf(loaded.map((e) => e.data?.matches ?? []), (m) => m.agent), [entries]);
  const maps = useMemo(() => unionOf(loaded.map((e) => e.data?.matches ?? []), (m) => m.map), [entries]);

  const toggleAgent = (name: string) =>
    setFilters((f) => ({
      ...f,
      agents: f.agents.includes(name) ? f.agents.filter((a) => a !== name) : [...f.agents, name],
    }));

  const rankRows: (RankRow & { matchesCount: number })[] = useMemo(
    () =>
      entries
        .map((e, i) => {
          if (!e.data) return null;
          const stats = statsFromMatches(filteredPerPlayer[i]);
          if (stats.games < filters.minGames) return null;
          const row: RankRow & { matchesCount: number } = {
            id: e.member.id,
            label: e.member.label,
            color: COLORS[e.member.id] ?? '#93a4b3',
            tier: e.data.currentTier,
            elo: e.data.currentElo ?? null,
            loading: false,
            stats,
            matchesCount: stats.games,
          };
          return row;
        })
        .filter((r): r is RankRow & { matchesCount: number } => r != null),
    [entries, filteredPerPlayer, filters.minGames],
  );

  const trendSeries = useMemo(
    () =>
      TEAM.map((m, i) => {
        if (!loaded.some((e) => e.member.id === m.id)) return null;
        const ms = filteredPerPlayer[i];
        if (ms.length < filters.minGames && filters.minGames > 0) return null;
        const points = buildTimeline(ms, gran, metric).filter((p) => p.value != null);
        if (!points.length) return null;
        return {
          id: m.id,
          label: m.label,
          color: COLORS[m.id] ?? '#93a4b3',
          points,
        };
      }).filter((s): s is NonNullable<typeof s> => s != null),
    [entries, filteredPerPlayer, filters.minGames, gran, metric],
  );

  const fmtMetric = (v: number) => (metric === 'kd' ? v.toFixed(2) : metric === 'wr' ? `${v.toFixed(0)}%` : String(Math.round(v)));

  const oldestTs = useMemo(() => {
    let min = Infinity;
    for (const list of filteredPerPlayer) for (const m of list) min = Math.min(min, m.timestamp);
    return Number.isFinite(min) ? new Date(min) : null;
  }, [filteredPerPlayer]);

  useEffect(() => () => setFilters(DEFAULT_FILTERS), [win]);

  return (
    <div className="wrap">
      <TopBar
        accent="red"
        title="Comparar"
        subtitle={['Equipo', 'Cuarteto']}
        chip={
          <span className="chip-red">
            {anyLoading
              ? 'cargando equipo…'
              : `${rankRows.length}/4 perfiles · ${filteredPerPlayer.reduce((a, l) => a + l.length, 0)} partidas`}
          </span>
        }
        updated={null}
        onRefresh={refresh}
        loading={isRefreshing}
        disabled={cooldown.locked}
        activePage="comparar"
      />

      <div className="controls" style={{ marginTop: 20 }}>
        {entries.map((e, i) => (
          <span key={e.member.id} className={`mini-card${e.isLoading ? ' skel' : ''}`}>
            <span className="p-dot" style={{ background: COLORS[e.member.id] }} />
            <b>{TEAM[i].label}</b>
            {e.data ? (
              <span className="mini-stats">
                {statsFromMatches(filteredPerPlayer[i]).games}p · WR{' '}
                {statsFromMatches(filteredPerPlayer[i]).wr.toFixed(0)}%
              </span>
            ) : (
              <span className="mini-stats">…</span>
            )}
          </span>
        ))}
      </div>

      <FiltersBar
        win={win}
        onWin={setWin}
        filters={filters}
        onFilters={setFilters}
        onToggleAgent={toggleAgent}
        agents={agents}
        maps={maps}
        gran={gran}
        onGran={setGran}
        metric={metric}
        onMetric={setMetric}
      />
      {oldestTs && (
        <p className="window-info" style={{ margin: '10px 0 0', paddingLeft: 4 }}>
          cobertura de datos desde {oldestTs.toLocaleDateString('es')} — el rango custom filtra dentro de lo consultado
        </p>
      )}

      <div className="panel">
        <h2>Ranking</h2>
        <RankingTable rows={rankRows} sortKey={sortKey} onSortKey={setSortKey} />
      </div>

      <div className="panel">
        <h2>Evolución por {gran === 'day' ? 'día' : 'semana'} · métrica {metric.toUpperCase()}</h2>
        <TrendCompare series={trendSeries} fmt={fmtMetric} />
      </div>

      <div className="panel">
        <h2>Heatmap jugador × agente</h2>
        <AgentHeatmap players={entries.map((e) => ({ id: e.member.id, label: e.member.label, matches: e.data?.matches ?? [] }))} filters={filters} minGames={filters.minGames} />
      </div>

      <div className="panel">
        <h2>Detalle jugador × agente</h2>
        <AgentStatsTable
          players={entries.map((e) => ({
            id: e.member.id,
            label: e.member.label,
            color: COLORS[e.member.id] ?? '#93a4b3',
            matches: e.data?.matches ?? [],
          }))}
          filters={filters}
          minGames={filters.minGames}
        />
      </div>
    </div>
  );
}
