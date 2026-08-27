'use client';

import { useEffect, useState } from 'react';
import { TopBar, RankChip } from '@/components/TopBar';
import { KpiGrid } from '@/components/KpiGrid';
import { WrPanel } from '@/components/WrPanel';
import { TierChart } from '@/components/TierChart';
import { MatchesTable } from '@/components/MatchesTable';
import { useValSummary, useValStatus, useBackgroundRefresh, summaryUrl, nextLimit, DEFAULT_LIMIT, type ValWindowMode } from '@/lib/hooks';
import { useCooldown } from '@/lib/useCooldown';
import { tierName } from '@/lib/metas';
import { getTeam, resolvePlayer } from '@/lib/team';

type WindowValue = 'season' | '7' | '14' | '30' | '90';
const TEAM = getTeam();

export default function ValorantPage() {
  const [win, setWin] = useState<WindowValue>('season');
  const [playerId, setPlayerId] = useState('alex');
  const [want, setWant] = useState<number>(DEFAULT_LIMIT);
  const cooldown = useCooldown(60);

  const member = resolvePlayer(playerId);
  const mode: ValWindowMode = win === 'season' ? { kind: 'season' } : { kind: 'days', days: Number(win) };
  const query = useValSummary(mode, playerId, want);
  const statusQ = useValStatus();

  const data = query.data;
  const error = query.error as (Error & { code?: string }) | null;

  const bgRefresh = useBackgroundRefresh({
    summaryUrl: summaryUrl(mode, playerId, want),
    getSyncedAt: () => data?.window.syncedAt,
    refetch: async () => {
      await query.refetch();
      await statusQ.refetch();
    },
  });

  const canLoadMore = data != null && data.window.fetchedMatches >= want && data.window.fetchedMatches < 40;
  const loadMore = () => {
    const next = nextLimit(want);
    if (next != null) setWant(next);
  };

  const updated = data ? `actualizado ${new Date(data.generatedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}` : null;

  const who = data?.account.gameName ?? member.label;
  const rankLabel = data
    ? `${who} · ${tierName(data.currentTier ?? 0)}${data.currentElo != null ? ` · ${data.currentElo} MMR` : ''}${data.startTier > 0 && data.currentTier !== data.startTier ? ` (desde ${tierName(data.startTier)})` : ''}`
    : `${member.label} —`;

  const rrTxt = data?.window.rrTotal != null ? ` · RR ${data.window.rrTotal > 0 ? '+' : ''}${data.window.rrTotal}` : '';
  const windowInfo = data
    ? `${data.window.seasonShort ? `Temporada ${data.window.seasonShort} · ` : ''}${data.window.consideredMatches} competitivas${rrTxt}`
    : '';

  const agentIcons = new Map<string, string | null>((data?.matches ?? []).map((m) => [m.agent, m.agentIcon ?? null]));
  const mapIcons = new Map<string, string | null>((data?.matches ?? []).map((m) => [m.map, m.mapIcon ?? null]));
  const agentRows = (data?.byAgent ?? []).map((a) => ({ ...a, name: a.agent }));
  const mapRows = (data?.byMap ?? []).map((m) => ({ ...m, name: m.map }));

  return (
    <div className="wrap">
      <TopBar
        accent="red"
        title="Ranked"
        subtitle={['Ranked', 'Report']}
        chip={<RankChip label={error ? '—' : rankLabel} />}
        updated={updated}
        onRefresh={bgRefresh.trigger}
        loading={bgRefresh.refreshing}
        disabled={bgRefresh.locked || cooldown.locked}
        activePage="ranked"
      />

      {error && (
        <div className={`banner ${error.code === 'KEY_MISSING' || error.code === 'KEY_EXPIRED' || error.code === 'KEY_INVALID' ? 'warn' : 'error'}`}>
          {error.message}
        </div>
      )}

      {bgRefresh.lastError && (
        <div className="banner warn">{bgRefresh.lastError}</div>
      )}

      {data && (
        <>
          <div className="controls">
            <label>Jugador</label>
            <div className="player-chips" style={{ ['--accent-row' as string]: '#ff4655' }}>
              {TEAM.map((t) => (
                <button
                  key={t.id}
                  className={`f-chip${playerId === t.id ? ' player-on' : ''}`}
                  title={t.role}
                  onClick={() => setPlayerId(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <label htmlFor="window">Ventana</label>
            <select id="window" value={win} onChange={(e) => setWin(e.target.value as WindowValue)}>
              <option value="season">Temporada actual</option>
              <option value="7">Últimos 7 días</option>
              <option value="14">Últimos 14 días</option>
              <option value="30">Últimos 30 días</option>
              <option value="90">Últimos 90 días</option>
            </select>
            <span className="window-info">{windowInfo}</span>
          </div>

          <KpiGrid kpis={data.kpis} accent="#ff4655" />

          <div className="two-col" style={{ ['--accent-row' as string]: '#ff4655' }}>
            <WrPanel label="Agente" rows={agentRows} icons={agentIcons} />
            <WrPanel label="Mapa" rows={mapRows} icons={mapIcons} />
          </div>

          <div className="panel">
            <h2>Trend de rango</h2>
            <TierChart matchesAsc={[...data.matches].reverse()} />
          </div>

          <MatchesTable matches={data.matches} playerId={playerId} canLoadMore={canLoadMore} onLoadMore={loadMore} />
        </>
      )}
    </div>
  );
}
