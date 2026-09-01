'use client';

import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { TopBar } from '@/components/TopBar';
import { CompCard } from '@/components/team/CompCard';
import type { WindowValue } from '@/components/compare/FiltersBar';
import { buildCompCards, type CompTeam } from '@/lib/comp';
import { useCooldown } from '@/lib/useCooldown';
import { getTeam, memberAccounts } from '@/lib/team';
import { mergeAccountSummaries } from '@/lib/compare';
import type { ValSummary } from '@/lib/types';

const TEAM = getTeam();
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
  const cooldown = useCooldown(15);

  const queries = useQueries({
    queries: ACCOUNTS.flatMap((accs, mi) =>
      accs.map((_, ai) => ({
        queryKey: ['team', TEAM[mi].id, ai, win],
        queryFn: async () => {
          const qs = win === 'season' ? 'season=current' : `days=${win}`;
          const res = await fetch(
            `/api/valorant/summary?${qs}&limit=${WANT}&player=${encodeURIComponent(TEAM[mi].id)}&account=${ai}`,
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
              `/api/valorant/refresh?player=${encodeURIComponent(TEAM[mi].id)}&scope=all&limit=${WANT}&account=${ai}`,
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

  const players: CompTeam[] = useMemo(() => {
    const out: CompTeam[] = [];
    for (let mi = 0; mi < TEAM.length; mi++) {
      const { start, count } = QUERY_RANGES[mi];
      const qs = queries.slice(start, start + count);
      const merged = mergeAccountSummaries(qs.map((q) => q.data));
      if (!merged) continue;
      out.push({
        id: TEAM[mi].id,
        label: TEAM[mi].label,
        color: COLORS[TEAM[mi].id] ?? '#93a4b3',
        role: TEAM[mi].role,
        prefs: TEAM[mi].prefs,
        matches: merged.matches,
      });
    }
    return out;
  }, [queries]);

  const allMatches = useMemo(() => players.flatMap((p) => p.matches), [players]);

  const cards = useMemo(() => (players.length === TEAM.length ? buildCompCards(players, allMatches) : []), [players, allMatches]);

  const anyError = queries.some((q) => q.error);
  const anyLoading = queries.some((q) => q.isLoading);

  return (
    <div className="wrap">
      <TopBar
        accent="red"
        title="Team"
        subtitle={['Composiciones', 'por mapa']}
        chip={
          <span className="chip-red">
            {anyLoading ? 'cargando equipo…' : `${cards.length} mapas · ${players.length}/4 jugadores`}
          </span>
        }
        updated={null}
        onRefresh={refresh}
        loading={isRefreshing}
        disabled={cooldown.locked}
        activePage="team"
      />

      {refreshError && <div className="banner warn">{refreshError}</div>}
      {anyError && !anyLoading && (
        <div className="banner warn">Algún perfil falló — revisa el estado de las cuentas o reintenta.</div>
      )}

      <div className="controls">
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
        <div className="ctl-group">
          <label>Reglas de composición</label>
          <span className="comp-sub" style={{ alignSelf: 'center', color: 'var(--faint)' }}>
            prioriza la meta pro (VCT 2026) · máx 2 por rol · sin dos roles duplicados
          </span>
        </div>
      </div>

      {players.length < TEAM.length ? (
        <p className="empty" style={{ marginTop: 24, paddingLeft: 4 }}>
          Cargando datos del equipo… ({players.length}/{TEAM.length})
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
    </div>
  );
}
