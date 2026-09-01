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
import { DEFAULT_LIMIT, nextLimit, MAX_LIMIT } from '@/lib/hooks';
import { getTeam, memberAccounts } from '@/lib/team';
import {
  applyFilters,
  buildTimeline,
  mergeAccountSummaries,
  statsFromMatches,
  unionOf,
  type CompareFilters,
  type Granularity,
  type MetricKey,
  DEFAULT_FILTERS,
} from '@/lib/compare';
import type { ValSummary } from '@/lib/types';

const TEAM = getTeam();
// Cuentas por miembro (principal + alternativas) para la mezcla de stats.
const ACCOUNTS = TEAM.map((m) => memberAccounts(m));
const QUERY_RANGES = (() => {
  const ranges: { start: number; count: number }[] = [];
  let s = 0;
  for (const accs of ACCOUNTS) {
    ranges.push({ start: s, count: accs.length });
    s += accs.length;
  }
  return ranges;
})();
const COLORS: Record<string, string> = {
  alex: '#ff4655',
  nomirc: '#35b6ff',
  gengar: '#e8c97a',
  juan: '#2fd08a',
};

type WinValue = WindowValue;

const POLL_MS = 4_000;
const POLL_TIMEOUT_MS = 120_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function ComparativoPage() {
  const [win, setWin] = useState<WinValue>('season');
  const [filters, setFilters] = useState<CompareFilters>(DEFAULT_FILTERS);
  const [gran, setGran] = useState<Granularity>('week');
  const [metric, setMetric] = useState<MetricKey>('wr');
  const [sortKey, setSortKey] = useState<SortKey>('wr');
  const [want, setWant] = useState<number>(DEFAULT_LIMIT);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const cooldown = useCooldown(15);

  const queries = useQueries({
    queries: ACCOUNTS.flatMap((accs, mi) =>
      accs.map((_, ai) => ({
        queryKey: ['compare', TEAM[mi].id, ai, win, want],
        queryFn: async () => {
          const qs = win === 'season' ? 'season=current' : `days=${win}`;
          const res = await fetch(
            `/api/valorant/summary?${qs}&limit=${want}&player=${encodeURIComponent(TEAM[mi].id)}&account=${ai}`,
          );
          const json = await res.json();
          if (!res.ok || json.error) throw Object.assign(new Error(json.error || 'Error de red'), { code: json.code });
          return json as ValSummary;
        },
        staleTime: 10 * 60 * 1000,
      })),
    ),
  });

  const refresh = async () => {
    if (isRefreshing || cooldown.locked) return;
    setIsRefreshing(true);
    setRefreshError(null);
    const before = queries.map((q) => (q.data as ValSummary | undefined)?.window.syncedAt ?? null);
    try {
      await Promise.all(
        ACCOUNTS.flatMap((accs, mi) =>
          accs.map((_, ai) =>
            fetch(
              `/api/valorant/refresh?player=${encodeURIComponent(TEAM[mi].id)}&scope=all&limit=${want}&account=${ai}`,
              { method: 'POST' },
            ),
          ),
        ),
      );
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      let done = false;
      while (!done && Date.now() < deadline) {
        await sleep(POLL_MS);
        const results = await Promise.all(queries.map((q) => q.refetch()));
        const synced = results.map((r) => (r.data as ValSummary | undefined)?.window.syncedAt ?? null);
        done = synced.every((s, i) => s == null || s !== before[i]);
        if (done) break;
      }
      if (!done) {
        setRefreshError('El servidor no confirmó la actualización a tiempo (si nada cambió, está bien).');
      }
    } catch {
      setRefreshError('No se pudo iniciar la actualización del equipo.');
    } finally {
      setIsRefreshing(false);
      cooldown.trigger();
    }
  };

  const allLoaded = queries.every((q) => q.data);
  const canLoadMore =
    allLoaded && queries[0].data != null &&
    queries.every((q) => {
      const d = q.data as ValSummary | undefined;
      return d != null && d.window.fetchedMatches >= want;
    }) &&
    (queries[0].data as ValSummary).window.fetchedMatches < MAX_LIMIT && nextLimit(want) != null;

  const entries = useMemo(() => {
    return TEAM.map((m, mi) => {
      const { start, count } = QUERY_RANGES[mi];
      const qs = queries.slice(start, start + count);
      const merged = mergeAccountSummaries(qs.map((q) => q.data));
      return {
        member: m,
        accounts: count,
        data: merged,
        error: qs.find((q) => q.error)?.error,
        isLoading: qs.some((q) => q.isLoading),
      };
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
            rr: e.data.currentRR ?? null,
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

      {refreshError && (
        <div className="banner warn">{refreshError}</div>
      )}

      <div className="controls" style={{ marginTop: 20 }}>
        {entries.map((e, i) => (
          <span
            key={e.member.id}
            className={`mini-card${e.isLoading ? ' skel' : ''}`}
            title={
              e.accounts > 1
                ? ACCOUNTS[i].map((a, ai) => `cuenta ${ai + 1}: ${a.name}#${a.tag}`).join(' · ')
                : undefined
            }
          >
            <span className="p-dot" style={{ background: COLORS[e.member.id] }} />
            <b>{TEAM[i].label}{e.accounts > 1 ? ` · ${e.accounts} cuentas` : ''}</b>
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

      {ACCOUNTS.some((accs) => accs.length > 1) && (
        <p className="window-info" style={{ margin: '8px 0 0', paddingLeft: 4 }}>
          stats mezcladas por jugador:{' '}
          {ACCOUNTS.map((accs, i) =>
            accs.length > 1
              ? `${TEAM[i].label} (${accs.map((a) => `${a.name}#${a.tag}`).join(' + ')})`
              : null,
          )
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}

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

      {canLoadMore && (
        <div className="filter-bar" style={{ marginTop: 10 }}>
          <button className="f-chip" onClick={() => setWant((w) => nextLimit(w) ?? w)}>
            Cargar más partidas del equipo ({want} → {nextLimit(want)})
          </button>
        </div>
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
