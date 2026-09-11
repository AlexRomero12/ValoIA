'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { TopBar } from '@/components/TopBar';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { FiltersBar, type WindowValue } from '@/components/compare/FiltersBar';
import { RankingTable, type RankRow, type SortKey } from '@/components/compare/RankingTable';
import { TrendCompare } from '@/components/compare/TrendCompare';
import { AgentHeatmap } from '@/components/compare/AgentHeatmap';
import { AgentStatsTable } from '@/components/compare/AgentStatsTable';
import { AgentByPlayerCards, AgentByAgentCards } from '@/components/compare/AgentCards';
import { ProfilePicker } from '@/components/profiles/ProfilePicker';
import { ProfileForm } from '@/components/profiles/ProfileForm';
import { useCooldown } from '@/lib/useCooldown';
import { DEFAULT_LIMIT, nextLimit, MAX_LIMIT, useProfiles } from '@/lib/hooks';
import { memberAccounts, profileColor, type Profile } from '@/lib/profileTypes';
import {
  applyFilters,
  buildTimeline,
  mergeAccountSummaries,
  resolveGranularity,
  statsFromMatches,
  unionOf,
  tierShort,
  RANK_AXIS_MIN,
  type CompareFilters,
  type Granularity,
  type MetricKey,
  DEFAULT_FILTERS,
} from '@/lib/compare';
import type { ValSummary } from '@/lib/types';

type WinValue = WindowValue;

const POLL_MS = 4_000;
const POLL_TIMEOUT_MS = 120_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function ComparativoPage() {
  const [win, setWin] = useState<WinValue>('season');
  const [filters, setFilters] = useState<CompareFilters>(DEFAULT_FILTERS);
  const [gran, setGran] = useState<Granularity>('auto');
  const [metric, setMetric] = useState<MetricKey>('wr');
  const [sortKey, setSortKey] = useState<SortKey>('wr');
  const [want, setWant] = useState<number>(DEFAULT_LIMIT);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshProgress, setRefreshProgress] = useState<{ done: number; total: number } | null>(null);
  const [userSelected, setUserSelected] = useState<string[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [tab, setTab] = useState<'resumen' | 'agentes'>('resumen');
  const [agentTab, setAgentTab] = useState<'jugador' | 'agente'>('jugador');
  const cooldown = useCooldown(15);

  const profilesQ = useProfiles();
  const allProfiles = useMemo(() => profilesQ.data ?? [], [profilesQ.data]);

  // Selección derivada: los visibles por defecto; el usuario puede ajustarla
  // (incluso dejarla vacía) y esa elección manda una vez existe.
  const defaultSelected = useMemo(() => {
    const visibles = allProfiles.filter((p) => p.visible).map((p) => p.id);
    return visibles.length ? visibles : allProfiles.map((p) => p.id);
  }, [allProfiles]);
  const selectedIds = userSelected ?? defaultSelected;

  const selected = useMemo(
    () => selectedIds.map((id) => allProfiles.find((p) => p.id === id)).filter((p): p is Profile => p != null),
    [selectedIds, allProfiles],
  );

  const colorOf = useMemo(() => {
    const map = new Map<string, string>();
    allProfiles.forEach((p, i) => map.set(p.id, profileColor(p, i)));
    return map;
  }, [allProfiles]);

  const accounts = useMemo(() => selected.map((m) => memberAccounts(m)), [selected]);
  const queryRanges = useMemo(() => {
    const ranges: { start: number; count: number }[] = [];
    let s = 0;
    for (const accs of accounts) {
      ranges.push({ start: s, count: accs.length });
      s += accs.length;
    }
    return ranges;
  }, [accounts]);

  const queries = useQueries({
    queries: selected.flatMap((profile, mi) =>
      accounts[mi].map((_, ai) => ({
        queryKey: ['compare', profile.id, ai, win, want],
        queryFn: async () => {
          const qs = win === 'season' ? 'season=current' : `days=${win}`;
          const res = await fetch(
            `/api/valorant/summary?${qs}&limit=${want}&player=${encodeURIComponent(profile.id)}&account=${ai}`,
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
    if (isRefreshing || cooldown.locked || selected.length === 0) return;
    setIsRefreshing(true);
    setRefreshError(null);
    setRefreshProgress({ done: 0, total: queries.length });
    const before = queries.map((q) => {
      const w = (q.data as ValSummary | undefined)?.window;
      return `${w?.syncedAt ?? ''}|${(w as { mmrSyncedAt?: string | null } | undefined)?.mmrSyncedAt ?? ''}`;
    });
    try {
      await Promise.all(
        selected.flatMap((profile, mi) =>
          accounts[mi].map((_, ai) =>
            fetch(
              `/api/valorant/refresh?player=${encodeURIComponent(profile.id)}&scope=all&limit=${want}&account=${ai}`,
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
        const synced = results.map((r) => {
          const w = (r.data as ValSummary | undefined)?.window;
          return `${w?.syncedAt ?? ''}|${(w as { mmrSyncedAt?: string | null } | undefined)?.mmrSyncedAt ?? ''}`;
        });
        const okCount = synced.filter((s, i) => s === '|' || s !== before[i]).length;
        setRefreshProgress({ done: okCount, total: synced.length });
        done = okCount === synced.length || synced.every((s, i) => s === '|' || s !== before[i]);
        if (done) break;
      }
      if (!done) {
        setRefreshError('El servidor no confirmó la actualización a tiempo (si nada cambió, está bien).');
      }
    } catch {
      setRefreshError('No se pudo iniciar la actualización del equipo.');
    } finally {
      setIsRefreshing(false);
      setRefreshProgress(null);
      cooldown.trigger();
    }
  };

  const totalAccounts = queries.length;
  const loadedAccounts = queries.filter((q) => q.data).length;
  const allLoaded = queries.every((q) => q.data) && totalAccounts > 0;
  const canLoadMore =
    allLoaded && queries[0].data != null &&
    queries.every((q) => {
      const d = q.data as ValSummary | undefined;
      return d != null && d.window.fetchedMatches >= want;
    }) &&
    (queries[0].data as ValSummary).window.fetchedMatches < MAX_LIMIT && nextLimit(want) != null;

  const entries = useMemo(() => {
    return selected.map((m, mi) => {
      const { start, count } = queryRanges[mi];
      const qs = queries.slice(start, start + count);
      const merged = mergeAccountSummaries(qs.map((q) => q.data));
      return {
        member: m,
        accounts: count,
        color: colorOf.get(m.id) ?? '#93a4b3',
        data: merged,
        error: qs.find((q) => q.error)?.error,
        isLoading: qs.some((q) => q.isLoading),
      };
    });
  }, [queries, selected, queryRanges, colorOf]);

  const anyLoading = entries.some((e) => e.isLoading);
  const loaded = entries.filter((e) => e.data);

  const filteredPerPlayer = entries.map((e) => applyFilters(e.data?.matches ?? [], filters));

  const agents = unionOf(loaded.map((e) => e.data?.matches ?? []), (m) => m.agent);
  const maps = unionOf(loaded.map((e) => e.data?.matches ?? []), (m) => m.map);

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
            color: e.color,
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

  // Rango efectivo del filtro (para granularidad auto + relleno de días).
  const rangeInfo = useMemo(() => {
    const fromTs = filters.from ? Date.parse(`${filters.from}T00:00:00`) : null;
    const toTs = filters.to ? Date.parse(`${filters.to}T00:00:00`) + 86_400_000 - 1 : null;
    let min = Infinity;
    let max = -Infinity;
    for (const list of filteredPerPlayer) for (const m of list) {
      if (m.timestamp < min) min = m.timestamp;
      if (m.timestamp > max) max = m.timestamp;
    }
    if (!Number.isFinite(min)) {
      for (const e of entries) for (const m of e.data?.matches ?? []) {
        if (m.timestamp < min) min = m.timestamp;
        if (m.timestamp > max) max = m.timestamp;
      }
    }
    let start: number | null = fromTs;
    let end: number | null = toTs;
    let spanDays: number;
    if (fromTs != null && toTs != null) {
      spanDays = Math.max(1, Math.round((toTs - fromTs + 1) / 86_400_000));
    } else if (win !== 'season' && fromTs == null && toTs == null) {
      spanDays = Number(win);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      end = today.getTime() + 86_400_000 - 1;
      start = today.getTime() - (spanDays - 1) * 86_400_000;
    } else {
      start = fromTs ?? (Number.isFinite(min) ? min : null);
      end = toTs ?? (Number.isFinite(max) ? max : null);
      if (win !== 'season') spanDays = Number(win);
      else if (start != null && end != null) spanDays = Math.max(1, Math.round((end - start) / 86_400_000) + 1);
      else spanDays = 30;
    }
    return { fromTs: start, toTs: end, spanDays };
  }, [entries, filteredPerPlayer, filters.from, filters.to, win]);

  const effGran = resolveGranularity(gran, rangeInfo.spanDays);

  const trendSeries = useMemo(
    () =>
      selected.map((m, i) => {
        if (!loaded.some((e) => e.member.id === m.id)) return null;
        const ms = filteredPerPlayer[i];
        if (ms.length < filters.minGames && filters.minGames > 0) return null;
        const fill = effGran === 'day' && metric !== 'rank' && rangeInfo.spanDays <= 31;
        const points = buildTimeline(ms, effGran, metric, {
          fillEmptyDays: fill,
          fromTs: fill ? rangeInfo.fromTs : null,
          toTs: fill ? rangeInfo.toTs : null,
        });
        if (!points.some((p) => p.value != null)) return null;
        return {
          id: m.id,
          label: m.label,
          color: colorOf.get(m.id) ?? '#93a4b3',
          points,
        };
      }).filter((s): s is NonNullable<typeof s> => s != null),
    [selected, loaded, filteredPerPlayer, filters.minGames, effGran, metric, rangeInfo, colorOf],
  );

  // Líneas de cuadrícula de la métrica de rango: un tier por línea.
  const rankFloor = useMemo(() => {
    const vs = trendSeries.flatMap((s) => s.points.map((p) => p.value).filter((v): v is number => v != null));
    const floor = vs.length ? Math.floor(Math.min(...vs) / 100) * 100 : RANK_AXIS_MIN;
    return Math.min(RANK_AXIS_MIN, floor);
  }, [trendSeries]);
  const rankTicks = useMemo(() => {
    const vs = trendSeries.flatMap((s) => s.points.map((p) => p.value ?? 0));
    const top = vs.length ? Math.max(...vs) : RANK_AXIS_MIN;
    const ticks: number[] = [];
    for (let t = rankFloor; t <= top + 100; t += 100) ticks.push(t);
    return ticks;
  }, [trendSeries, rankFloor]);

  const fmtMetric = (v: number) => {
    if (metric === 'kd') return v.toFixed(2);
    if (metric === 'wr') return `${v.toFixed(0)}%`;
    if (metric === 'rank') {
      if (v >= 27 * 100) {
        const rr = Math.round(v - 27 * 100);
        return rr > 0 ? `RAD · ${rr}` : 'RAD';
      }
      const tier = Math.floor(v / 100);
      const rr = Math.round(v % 100);
      const name = tierShort(tier);
      return rr > 0 ? `${name} · ${rr}` : name;
    }
    return String(Math.round(v));
  };

  const oldestTs = useMemo(() => {
    let min = Infinity;
    for (const e of entries) for (const m of e.data?.matches ?? []) min = Math.min(min, m.timestamp);
    return Number.isFinite(min) ? new Date(min) : null;
  }, [entries]);
  const anyTruncated = entries.some((e) => e.data?.window.truncated === true);

  useEffect(() => () => setFilters(DEFAULT_FILTERS), [win]);

  const loadingProfiles = profilesQ.isLoading;
  const coldLoad = selected.length > 0 && anyLoading && loadedAccounts === 0;
  const agentPlayers = entries.map((e) => ({
    id: e.member.id,
    label: e.member.label,
    color: e.color,
    matches: e.data?.matches ?? [],
  }));

  return (
    <div className="wrap">
      <TopBar
        accent="red"
        title="Comparar"
        subtitle={['Equipo', 'Perfiles']}
        chip={
          <span className="chip-red">
            {loadingProfiles || coldLoad
              ? `cargando ${loadedAccounts}/${totalAccounts}…`
              : `${rankRows.length}/${selected.length} perfiles · ${filteredPerPlayer.reduce((a, l) => a + l.length, 0)} partidas`}
          </span>
        }
        updated={null}
        onRefresh={refresh}
        loading={isRefreshing}
        disabled={cooldown.locked || selected.length === 0}
        activePage="comparar"
      />

      <LoadingOverlay
        open={loadingProfiles}
        title="Cargando perfiles"
        message="Leyendo los perfiles configurados"
        blocking
      />
      <LoadingOverlay
        open={coldLoad}
        title="Cargando perfiles seleccionados"
        message={`Partidas y MMR de ${selected.length} perfil(es) — la primera carga puede tardar`}
        progress={{ done: loadedAccounts, total: totalAccounts }}
        blocking
      />
      <LoadingOverlay
        open={isRefreshing}
        title="Actualizando perfiles"
        message="Sincronizando partidas y MMR (throttle ~18 req/min)"
        progress={refreshProgress}
        hint={refreshProgress && refreshProgress.done < refreshProgress.total ? 'No cierres la pestaña: el progreso se confirma perfil a perfil.' : undefined}
      />

      {refreshError && (
        <div className="banner warn">{refreshError}</div>
      )}

      <div className="controls ranked-controls" style={{ marginTop: 20 }}>
        <label>Perfiles</label>
        <ProfilePicker
          profiles={allProfiles}
          selected={selectedIds}
          onChange={setUserSelected}
          onAddProfile={() => setFormOpen(true)}
        />
      </div>

      {selected.length === 0 && !loadingProfiles ? (
        <div className="panel">
          <p className="empty">Selecciona al menos un perfil para comparar (o agrega uno nuevo).</p>
        </div>
      ) : null}

      {entries.length > 0 ? (
        <div className="controls cmp-minis" style={{ marginTop: 8 }}>
          {entries.map((e, i) => (
            <span
              key={e.member.id}
              className={`mini-card${e.isLoading ? ' skel' : ''}`}
              title={
                e.accounts > 1
                  ? accounts[i].map((a, ai) => `cuenta ${ai + 1}: ${a.name}#${a.tag}`).join(' · ')
                  : undefined
              }
            >
              <span className="p-dot" style={{ background: e.color }} />
              <b>{e.member.label}{e.accounts > 1 ? ` · ${e.accounts} cuentas` : ''}</b>
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
      ) : null}

      {accounts.some((accs) => accs.length > 1) && (
        <p className="window-info" style={{ margin: '8px 0 0', paddingLeft: 4 }}>
          stats mezcladas por jugador:{' '}
          {accounts.map((accs, i) =>
            accs.length > 1
              ? `${selected[i].label} (${accs.map((a) => `${a.name}#${a.tag}`).join(' + ')})`
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
          {anyTruncated ? ' · ventana truncada: puede haber más partidas fuera de lo sincronizado' : ''}
        </p>
      )}

      {canLoadMore && (
        <div className="filter-bar" style={{ marginTop: 10 }}>
          <button className="f-chip" onClick={() => setWant((w) => nextLimit(w) ?? w)}>
            Cargar más partidas del equipo ({want} → {nextLimit(want)})
          </button>
        </div>
      )}

      <div className="pill-toggle cmp-tabs only-mobile" role="tablist" aria-label="Vista del comparativo">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'resumen'}
          className={tab === 'resumen' ? 'on' : ''}
          onClick={() => setTab('resumen')}
        >
          Resumen
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'agentes'}
          className={tab === 'agentes' ? 'on' : ''}
          onClick={() => setTab('agentes')}
        >
          Agentes
        </button>
      </div>

      <div className={`cmp-pane${tab !== 'resumen' ? ' off' : ''}`}>
        <div className="panel">
          <h2>Ranking</h2>
          <RankingTable rows={rankRows} sortKey={sortKey} onSortKey={setSortKey} />
        </div>

        <div className="panel">
          <h2>Evolución por {effGran === 'day' ? 'día' : 'semana'}{gran === 'auto' ? ' (auto)' : ''} · métrica {metric === 'rank' ? 'RANGO' : metric.toUpperCase()}</h2>
          <TrendCompare
            series={trendSeries}
            fmt={fmtMetric}
            minValue={metric === 'rank' ? rankFloor : undefined}
            ticks={metric === 'rank' ? rankTicks : undefined}
          />
        </div>
      </div>

      <div className={`cmp-pane${tab !== 'agentes' ? ' off' : ''}`}>
        <div className="pill-toggle agent-mobile-tabs only-mobile" role="tablist" aria-label="Vista por agente">
          <button
            type="button"
            role="tab"
            aria-selected={agentTab === 'jugador'}
            className={agentTab === 'jugador' ? 'on' : ''}
            onClick={() => setAgentTab('jugador')}
          >
            Por jugador
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={agentTab === 'agente'}
            className={agentTab === 'agente' ? 'on' : ''}
            onClick={() => setAgentTab('agente')}
          >
            Por agente
          </button>
        </div>

        <div className={`agent-mobile${agentTab !== 'jugador' ? ' off' : ''}`}>
          <AgentByPlayerCards players={agentPlayers} filters={filters} minGames={filters.minGames} />
        </div>
        <div className={`agent-mobile${agentTab !== 'agente' ? ' off' : ''}`}>
          <AgentByAgentCards players={agentPlayers} filters={filters} minGames={filters.minGames} />
        </div>

        <div className="agent-desktop">
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
                color: e.color,
                matches: e.data?.matches ?? [],
              }))}
              filters={filters}
              minGames={filters.minGames}
            />
          </div>
        </div>
      </div>

      {formOpen && (
        <ProfileForm
          profile={null}
          profiles={allProfiles}
          onClose={() => setFormOpen(false)}
          onSaved={(list) => {
            const created = list.find((p) => !allProfiles.some((x) => x.id === p.id));
            if (created) setUserSelected([...selectedIds, created.id]);
          }}
        />
      )}
    </div>
  );
}
