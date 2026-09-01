'use client';

import { esc, wrColor } from '@/lib/metas';
import type { AgentPick, CompCard } from '@/lib/comp';

interface CompCardProps {
  card: CompCard;
}

const ROLE_COLOR: Record<string, string> = {
  Duelist: '#ff4655',
  Controller: '#35b6ff',
  Initiator: '#e8c97a',
  Sentinel: '#2fd08a',
};

function PickStat({ pick }: { pick: AgentPick }) {
  const losses = pick.games - pick.wins;
  const srcLabel =
    pick.source === 'map' ? 'WR con este agente en este mapa'
      : pick.source === 'agent' ? 'WR global del agente (sin datos en este mapa)'
        : 'sin partidas con este agente';
  return (
    <span
      className="comp-wr"
      title={`${esc(pick.agent)} ${pick.games ? `— ${srcLabel}: ${pick.wins}V-${losses}D · K/D ${pick.kd.toFixed(2)}` : '— sin muestra'}`}
    >
      {pick.source !== 'map' && pick.games > 0 && <span className="global-badge">global</span>}
      <span className="wr-num" style={{ color: wrColor(pick.wr) }}>
        {pick.games > 0 ? pick.wr.toFixed(0) : '—'}%
      </span>
      <span className="comp-sub" style={{ color: 'var(--faint)' }}>
        {pick.games > 0 ? `${pick.games}p · ${pick.wins}V–${losses}D` : 'sin muestra'}
      </span>
      <span className="comp-sub" style={{ color: 'var(--faint)' }}>
        {pick.games > 0 ? `K/D ${pick.kd.toFixed(2)}` : ''}
      </span>
    </span>
  );
}

export function CompCard({ card }: CompCardProps) {
  const losses = card.teamGames - card.teamWins;
  return (
    <div className="panel">
      <h2 className="comp-head">
        {card.mapIcon ? <img className="map-icon" src={card.mapIcon} alt="" loading="lazy" /> : null}
        {esc(card.map)}
        <span className="chip-blue comp-mapwr">
          {card.teamGames > 0
            ? `equipo ${card.teamWr.toFixed(0)}% WR · ${card.teamWins}V–${losses}D`
            : 'sin partidas en ventana'}
          {card.entries.length > 0 ? ` · comp esperada ~${card.score.toFixed(0)}%` : ''}
        </span>
      </h2>
      {card.entries.length === 0 ? (
        <p className="empty">Sin datos suficientes para esta composición.</p>
      ) : (
        <div className="comp-body">
          {card.entries.map((e) => {
            const role = e.pick.role ?? 'Flex';
            return (
              <div key={e.label} className="comp-row">
                <span className="p-dot" style={{ background: e.color }} />
                <b className="comp-player">{esc(e.label)}</b>
                <span className="comp-pick">
                  {e.pick.agentIcon ? <img className="agent-icon" src={e.pick.agentIcon} alt="" loading="lazy" /> : null}
                  <span className="agent-name">{esc(e.pick.agent)}</span>
                  <span
                    className="role-pill"
                    style={{ color: ROLE_COLOR[role] ?? 'var(--mute)', borderColor: (ROLE_COLOR[role] ?? 'var(--line-strong)') + '77' }}
                  >
                    {esc(role)}
                  </span>
                  {e.pick.metaPick >= 10 && (
                    <span
                      className={`meta-pill${e.pick.metaPick >= 20 ? ' strong' : ''}`}
                      title={`uso pro en este mapa: ${e.pick.metaPick}% (VCT 2026 Americas Stage 2)`}
                    >
                      {e.pick.metaPick}%
                    </span>
                  )}
                </span>
                <PickStat pick={e.pick} />
                {e.backups.length > 0 && (
                  <span className="comp-backs">
                    {e.backups.map((b) => (
                      <span
                        key={b.agent + b.source}
                        className="comp-back"
                        title={`${esc(b.agent)} — WR ${b.games > 0 ? b.wr.toFixed(0) : '—'}% (${b.games}p)${b.source === 'map' ? '' : ' · datos globales'}`}
                      >
                        {b.agentIcon ? <img className="agent-icon sm" src={b.agentIcon} alt="" loading="lazy" /> : null}
                        {esc(b.agent)}
                        <b>{b.games > 0 ? `${b.wr.toFixed(0)}%` : '—'}</b>
                      </span>
                    ))}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
