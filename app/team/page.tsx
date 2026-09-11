'use client';

import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { TopBar } from '@/components/TopBar';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { CompCard } from '@/components/team/CompCard';
import type { WindowValue } from '@/components/compare/FiltersBar';
import { ProfilePicker } from '@/components/profiles/ProfilePicker';
import { ProfileForm } from '@/components/profiles/ProfileForm';
import { buildCompCards, type CompTeam } from '@/lib/comp';
import { useCooldown } from '@/lib/useCooldown';
import { useProfiles } from '@/lib/hooks';
import { mergeAccountSummaries } from '@/lib/compare';
import { memberAccounts, profileColor, type Profile } from '@/lib/profileTypes';
import type { ValSummary } from '@/lib/types';

const WANT = 40;
const POLL_MS = 4_000;
const POLL_TIMEOUT_MS = 120_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function TeamPage() {
  const [win, setWin] = useState<WindowValue>('365');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshProgress, setRefreshProgress] = useState<{ done: number; total: number } | null>(null);
  const [userSelected, setUserSelected] = useState<string[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const cooldown = useCooldown(15);

  const profilesQ = useProfiles();
  const allProfiles = useMemo(() => profilesQ.data ?? [], [profilesQ.data]);

  // Selección derivada: los visibles por defecto; el usuario puede ajustarla.
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
        queryKey: ['team', profile.id, ai, win],
        queryFn: async () => {
          const qs = win === 'season' ? 'season=current' : `days=${win}`;
          const res = await fetch(
            `/api/valorant/summary?${qs}&limit=${WANT}&player=${encodeURIComponent(profile.id)}&account=${ai}`,
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
    const before = queries.map((q) => (q.data as ValSummary | undefined)?.window.syncedAt ?? null);
    try {
      await Promise.all(
        selected.flatMap((profile, mi) =>
          accounts[mi].map((_, ai) =>
            fetch(
              `/api/valorant/refresh?player=${encodeURIComponent(profile.id)}&scope=all&limit=${WANT}&account=${ai}`,
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
        const okCount = synced.filter((s, i) => s == null || s !== before[i]).length;
        setRefreshProgress({ done: okCount, total: synced.length });
        done = okCount === synced.length;
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

  const players: CompTeam[] = useMemo(() => {
    const out: CompTeam[] = [];
    for (let mi = 0; mi < selected.length; mi++) {
      const { start, count } = queryRanges[mi];
      const qs = queries.slice(start, start + count);
      const merged = mergeAccountSummaries(qs.map((q) => q.data));
      if (!merged) continue;
      out.push({
        id: selected[mi].id,
        label: selected[mi].label,
        color: colorOf.get(selected[mi].id) ?? '#93a4b3',
        role: selected[mi].role,
        prefs: selected[mi].prefs,
        matches: merged.matches,
      });
    }
    return out;
  }, [queries, selected, queryRanges, colorOf]);

  const allMatches = useMemo(() => players.flatMap((p) => p.matches), [players]);

  const cards = useMemo(
    () => (players.length > 0 ? buildCompCards(players, allMatches) : []),
    [players, allMatches],
  );

  const anyError = queries.some((q) => q.error);
  const loadedAccounts = queries.filter((q) => q.data).length;
  const anyLoading = queries.some((q) => q.isLoading);
  const loadingProfiles = profilesQ.isLoading;
  const coldLoad = selected.length > 0 && anyLoading && loadedAccounts === 0;

  return (
    <div className="wrap">
      <TopBar
        accent="red"
        title="Equipo"
        subtitle={['Composiciones', 'por mapa']}
        chip={
          <span className="chip-red">
            {loadingProfiles || coldLoad
              ? `cargando ${loadedAccounts}/${queries.length}…`
              : `${cards.length} mapas · ${players.length} jugadores`}
          </span>
        }
        updated={null}
        onRefresh={refresh}
        loading={isRefreshing}
        disabled={cooldown.locked || selected.length === 0}
        activePage="team"
      />

      <LoadingOverlay open={loadingProfiles} title="Cargando perfiles" message="Leyendo los perfiles configurados" blocking />
      <LoadingOverlay
        open={coldLoad}
        title="Cargando perfiles seleccionados"
        message={`Partidas de ${selected.length} perfil(es) — la primera carga puede tardar`}
        progress={{ done: loadedAccounts, total: queries.length }}
        blocking
      />
      <LoadingOverlay
        open={isRefreshing}
        title="Actualizando perfiles"
        message="Sincronizando partidas y MMR (throttle ~18 req/min)"
        progress={refreshProgress}
        hint={refreshProgress && refreshProgress.done < refreshProgress.total ? 'No cierres la pestaña: el progreso se confirma perfil a perfil.' : undefined}
      />

      {refreshError && <div className="banner warn">{refreshError}</div>}
      {anyError && !anyLoading && (
        <div className="banner warn">Algún perfil falló — revisa el estado de las cuentas o reintenta.</div>
      )}

      <div className="controls">
        <label>Perfiles</label>
        <ProfilePicker
          profiles={allProfiles}
          selected={selectedIds}
          onChange={setUserSelected}
          onAddProfile={() => setFormOpen(true)}
        />
        <div className="ctl-group">
          <label>Ventana</label>
          <select value={win} onChange={(e) => setWin(e.target.value as WindowValue)}>
            <option value="365">1 año (máximo)</option>
            <option value="season">Temporada actual</option>
            <option value="90">90 días</option>
            <option value="30">30 días</option>
            <option value="14">14 días</option>
            <option value="7">7 días</option>
          </select>
        </div>
      </div>
      <p className="window-info" style={{ margin: '8px 0 0', paddingLeft: 4 }}>
        prioriza la meta pro (VCT 2026) · máx 2 por rol · sin dos roles duplicados
        {selected.length !== 4 ? ' · con 4 jugadores reparte 1 rol por jugador; con otro número usa la mejor combinación libre' : ''}
      </p>

      {selected.length === 0 && !loadingProfiles ? (
        <div className="panel" style={{ marginTop: 16 }}>
          <p className="empty">Selecciona al menos un perfil para generar composiciones (o agrega uno nuevo).</p>
        </div>
      ) : players.length < selected.length ? (
        <p className="empty" style={{ marginTop: 24, paddingLeft: 4 }}>
          Cargando datos del equipo… ({players.length}/{selected.length})
        </p>
      ) : cards.length === 0 ? (
        <p className="empty" style={{ marginTop: 24, paddingLeft: 4 }}>
          Sin partidas del equipo en esta ventana. Juega competitivas o cambia la ventana para ver composiciones.
        </p>
      ) : (
        <div className="comp-list">
          {cards.map((c) => <CompCard key={c.map} card={c} />)}
        </div>
      )}

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
