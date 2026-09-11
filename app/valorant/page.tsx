'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQueries } from '@tanstack/react-query';
import { TopBar, RankChip } from '@/components/TopBar';
import { TierIcon } from '@/components/TierIcon';
import { KpiGrid } from '@/components/KpiGrid';
import { WrPanel } from '@/components/WrPanel';
import { ArsenalPanel } from '@/components/ArsenalPanel';
import { TierChart } from '@/components/TierChart';
import { MatchesTable } from '@/components/MatchesTable';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useProfiles, nextLimit, DEFAULT_LIMIT, MAX_LIMIT } from '@/lib/hooks';
import { useCooldown } from '@/lib/useCooldown';
import { mergeAccountSummaries } from '@/lib/compare';
import { memberAccounts } from '@/lib/profileTypes';
import { tierName } from '@/lib/metas';
import type { ValSummary } from '@/lib/types';

type WindowValue = 'season' | '7' | '14' | '30' | '90';

const POLL_MS = 4_000;
const POLL_TIMEOUT_MS = 120_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function ValorantPage() {
  const [win, setWin] = useState<WindowValue>('season');
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [want, setWant] = useState<number>(DEFAULT_LIMIT);
  const [fMap, setFMap] = useState<string | null>(null);
  const [fAgent, setFAgent] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshProgress, setRefreshProgress] = useState<{ done: number; total: number } | null>(null);
  const cooldown = useCooldown(60);

  const profilesQ = useProfiles();
  const profiles = useMemo(() => (profilesQ.data ?? []).filter((p) => p.visible), [profilesQ.data]);

  // Selección derivada: si el perfil elegido desaparece, cae al primero visible.
  const activeId = profiles.some((p) => p.id === pickedId) ? (pickedId as string) : (profiles[0]?.id ?? '');
  const member = profiles.find((p) => p.id === activeId) ?? profiles[0];

  // Ranked combina TODAS las cuentas del perfil (principal + alternativas):
  // el WR por agente/mapa refleja todo lo que juega el jugador.
  const accounts = useMemo(() => (member ? memberAccounts(member) : []), [member]);

  const queries = useQueries({
    queries: accounts.map((_, ai) => ({
      queryKey: ['val-summary', activeId, ai, win, want],
      queryFn: async () => {
        const qs = win === 'season' ? 'season=current' : `days=${win}`;
        const res = await fetch(
          `/api/valorant/summary?${qs}&limit=${want}&player=${encodeURIComponent(activeId)}&account=${ai}`,
        );
        const json = await res.json();
        if (!res.ok || json.error) throw Object.assign(new Error(json.error || 'Error de red'), { code: json.code });
        return json as ValSummary;
      },
      staleTime: 10 * 60 * 1000,
      enabled: Boolean(activeId),
    })),
  });

  const data = useMemo(() => mergeAccountSummaries(queries.map((q) => q.data as ValSummary | undefined)), [queries]);
  const error = (queries.find((q) => q.error)?.error as (Error & { code?: string }) | undefined) ?? null;
  const anyLoading = queries.some((q) => q.isLoading);
  const loadedAccounts = queries.filter((q) => q.data).length;
  const anyFailed = queries.some((q) => q.error) && loadedAccounts > 0;

  const refresh = async () => {
    if (isRefreshing || cooldown.locked || !activeId || accounts.length === 0) return;
    setIsRefreshing(true);
    setRefreshError(null);
    setRefreshProgress({ done: 0, total: queries.length });
    const before = queries.map((q) => {
      const w = (q.data as ValSummary | undefined)?.window;
      return `${w?.syncedAt ?? ''}|${w?.mmrSyncedAt ?? ''}`;
    });
    try {
      await Promise.all(
        accounts.map((_, ai) =>
          fetch(
            `/api/valorant/refresh?player=${encodeURIComponent(activeId)}&scope=all&limit=${want}&account=${ai}`,
            { method: 'POST' },
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
          return `${w?.syncedAt ?? ''}|${w?.mmrSyncedAt ?? ''}`;
        });
        const okCount = synced.filter((s, i) => s === '|' || s !== before[i]).length;
        setRefreshProgress({ done: okCount, total: synced.length });
        done = okCount === synced.length;
        if (done) break;
      }
      if (!done) {
        setRefreshError('El servidor no confirmó la actualización a tiempo (si nada cambió, está bien).');
      }
    } catch {
      setRefreshError('No se pudo iniciar la actualización.');
    } finally {
      setIsRefreshing(false);
      setRefreshProgress(null);
      cooldown.trigger();
    }
  };

  const totalAccounts = queries.length;
  const allLoaded = queries.every((q) => q.data) && totalAccounts > 0;
  const canLoadMore =
    allLoaded &&
    queries.every((q) => {
      const d = q.data as ValSummary | undefined;
      return d != null && d.window.fetchedMatches >= want;
    }) &&
    (queries[0].data as ValSummary).window.fetchedMatches < MAX_LIMIT &&
    nextLimit(want) != null;
  const loadMore = () => {
    const next = nextLimit(want);
    if (next != null) setWant(next);
  };

  const updated = data ? `actualizado ${new Date(data.generatedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}` : null;

  const who = data?.account.gameName ?? member?.label ?? '—';
  const rankLabel = data
    ? `${member?.label ?? who} · ${tierName(data.currentTier ?? 0)}${data.currentElo != null ? ` · ${data.currentElo} MMR` : ''}${data.startTier > 0 && data.currentTier !== data.startTier ? ` (desde ${tierName(data.startTier)})` : ''}`
    : `${member?.label ?? '—'} —`;

  const rrMissing = data?.window.rrMissing ?? 0;
  const rrTxt = data?.window.rrTotal != null ? ` · RR ${data.window.rrTotal > 0 ? '+' : ''}${data.window.rrTotal}${rrMissing > 0 ? '~' : ''}` : '';
  const windowInfo = data
    ? `${data.window.seasonShort ? `Temporada ${data.window.seasonShort} · ` : ''}${data.window.consideredMatches} competitivas${rrTxt}${rrMissing > 0 ? ` (RR de ${data.window.consideredMatches - rrMissing}/${data.window.consideredMatches})` : ''}${data.window.truncated ? ' · ventana truncada' : ''}`
    : '';

  const agentIcons = new Map<string, string | null>((data?.matches ?? []).map((m) => [m.agent, m.agentIcon ?? null]));
  const mapIcons = new Map<string, string | null>((data?.matches ?? []).map((m) => [m.map, m.mapIcon ?? null]));
  const agentRows = (data?.byAgent ?? []).map((a) => ({ ...a, name: a.agent }));
  const mapRows = (data?.byMap ?? []).map((m) => ({ ...m, name: m.map }));

  const onFilter = (kind: 'map' | 'agent', value: string | null) => (kind === 'map' ? setFMap : setFAgent)(value);
  const toggleFilter = (kind: 'map' | 'agent', value: string) =>
    onFilter(kind, (kind === 'map' ? fMap : fAgent) === value ? null : value);

  const loadingProfiles = profilesQ.isLoading;
  const coldLoad = Boolean(activeId) && anyLoading && loadedAccounts === 0;

  return (
    <div className="wrap">
      <TopBar
        accent="red"
        title="Ranked"
        subtitle={['Ranked', 'Report']}
        chip={
          <RankChip title={rankLabel}>
            {error || !data ? (
              '—'
            ) : (
              <>
                <TierIcon tier={data.currentTier ?? 0} size={18} />
                <span>{who}</span>
                {data.currentRR != null ? <span>· {data.currentRR} RR</span> : null}
                {data.startTier > 0 && data.currentTier !== data.startTier ? (
                  <span className="chip-since">
                    desde <TierIcon tier={data.startTier} size={15} />
                  </span>
                ) : null}
              </>
            )}
          </RankChip>
        }
        updated={updated}
        onRefresh={refresh}
        loading={isRefreshing || loadingProfiles}
        disabled={cooldown.locked || !activeId || coldLoad}
        activePage="ranked"
      />

      <LoadingOverlay
        open={loadingProfiles}
        title="Cargando perfiles"
        message="Leyendo los perfiles configurados"
        blocking
      />
      <LoadingOverlay
        open={coldLoad}
        title={`Cargando a ${member?.label ?? 'jugador'}`}
        message={`Partidas, MMR y stats de ${accounts.length} cuenta(s) — la primera carga puede tardar`}
        progress={{ done: loadedAccounts, total: totalAccounts }}
        blocking
      />
      <LoadingOverlay
        open={isRefreshing}
        title="Actualizando"
        message={`Sincronizando ${accounts.length} cuenta(s) (throttle ~18 req/min)`}
        progress={refreshProgress}
        hint={refreshProgress && refreshProgress.done < refreshProgress.total ? 'No cierres la pestaña: el progreso se confirma cuenta a cuenta.' : undefined}
      />

      {profiles.length === 0 && !loadingProfiles ? (
        <div className="panel" style={{ marginTop: 20 }}>
          <p className="empty">
            No hay perfiles visibles. <Link href="/perfiles">Configura tus perfiles</Link> para ver el reporte.
          </p>
        </div>
      ) : null}

      {error && (
        <div className={`banner ${error.code === 'KEY_MISSING' || error.code === 'KEY_EXPIRED' || error.code === 'KEY_INVALID' ? 'warn' : 'error'}`}>
          {error.message}
        </div>
      )}

      {anyFailed && !error ? (
        <div className="banner warn">Una de las cuentas falló; las stats combinadas pueden estar incompletas.</div>
      ) : null}

      {refreshError && (
        <div className="banner warn">{refreshError}</div>
      )}

      {data && (
        <>
          <div className="controls ranked-controls">
            <label>Jugador</label>
            <div className="player-row">
              <div className="player-chips" style={{ ['--accent-row' as string]: '#ff4655' }}>
                {profiles.map((t) => (
                  <button
                    key={t.id}
                    className={`f-chip${activeId === t.id ? ' player-on' : ''}`}
                    title={`${t.name}#${t.tag}${t.role ? ` · ${t.role}` : ''}`}
                    onClick={() => setPickedId(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <Link className="f-chip profile-chip add" href="/perfiles" title="Gestionar perfiles">⚙ Perfiles</Link>
            </div>
            <label htmlFor="window">Periodo</label>
            <select id="window" value={win} onChange={(e) => setWin(e.target.value as WindowValue)}>
              <option value="season">Temporada actual</option>
              <option value="7">Últimos 7 días</option>
              <option value="14">Últimos 14 días</option>
              <option value="30">Últimos 30 días</option>
              <option value="90">Últimos 90 días</option>
            </select>
            <span className="window-info">{windowInfo}</span>
          </div>

          {accounts.length > 1 ? (
            <p className="window-info" style={{ margin: '8px 0 0', paddingLeft: 4 }}>
              stats combinadas de {accounts.length} cuentas: {accounts.map((a) => `${a.name}#${a.tag}`).join(' + ')}
            </p>
          ) : null}

          <KpiGrid kpis={data.kpis} accent="#ff4655" />

          <div className="two-col" style={{ ['--accent-row' as string]: '#ff4655' }}>
            <WrPanel label="Agente" rows={agentRows} icons={agentIcons} active={fAgent} onPick={(name) => toggleFilter('agent', name)} limit={6} />
            <WrPanel label="Mapa" rows={mapRows} icons={mapIcons} active={fMap} onPick={(name) => toggleFilter('map', name)} />
          </div>

          <MatchesTable
            matches={data.matches}
            playerId={activeId}
            fMap={fMap}
            fAgent={fAgent}
            onFilter={onFilter}
            canLoadMore={canLoadMore}
            onLoadMore={loadMore}
          />

          <ArsenalPanel arsenal={data.arsenal} />

          <div className="panel">
            <h2>Trend de rango</h2>
            <TierChart matchesAsc={[...data.matches].reverse()} />
          </div>
        </>
      )}
    </div>
  );
}
