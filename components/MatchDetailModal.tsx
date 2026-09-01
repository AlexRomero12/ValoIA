'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMatchDetail } from '@/lib/hooks';
import { TierIcon } from '@/components/TierIcon';
import type { MatchRow } from '@/lib/types';
import type { DetailPlayer } from '@/lib/matchDetail';

interface MatchDetailModalProps {
  match: MatchRow;
  playerId?: string;
  onClose: () => void;
}

export function MatchDetailModal({ match, playerId, onClose }: MatchDetailModalProps) {
  const query = useMatchDetail(match.matchId, playerId);
  const detail = query.data;
  const error = query.error as (Error & { code?: string }) | null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // El modal solo se monta tras un click del usuario (client-side): document existe.
  if (typeof document === 'undefined') return null;

  const myTeamId = detail?.players.find((x) => x.isMe)?.teamId;
  const myPlayers = detail?.players.filter((p) => p.teamId === myTeamId) ?? [];
  const enemyPlayers = detail?.players.filter((p) => p.teamId !== myTeamId) ?? [];

  return createPortal(
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>

        <header className="md-head">
          <div className="md-icons">
            {match.mapIcon ? <img className="map-icon" src={match.mapIcon} alt="" /> : null}
            {match.agentIcon ? <img className="agent-icon" src={match.agentIcon} alt="" /> : null}
          </div>
          <div className="md-title">
            <h3>
              {match.map} · {match.agent}
              <span className={`res-badge ${match.won ? 'w' : 'l'}`}>{match.won ? 'Victoria' : 'Derrota'}</span>
            </h3>
            <span className="md-sub">
              {new Date(match.timestamp).toLocaleString('es')} · {match.roundsWon}–{match.roundsLost} · <TierIcon tier={match.tier} size={20} /> ·{' '}
              {detail ? `${detail.meta.durationMin} min${detail.meta.seasonShort ? ` · ${detail.meta.seasonShort}` : ''}` : ''}
            </span>
          </div>
          <div className={`md-rr ${rrCls(match.rrDelta)}`}>
            {match.rrDelta != null ? `${match.rrDelta > 0 ? '+' : ''}${match.rrDelta} RR` : '—'}
          </div>
        </header>

        {query.isLoading && <p className="empty">Cargando detalle…</p>}
        {error && (
          <p className="empty">
            {error.message}
          </p>
        )}

        {detail && (
          <>
            <section className="md-section">
              <h4>Timeline de rondas</h4>
              <div className="round-strip">
                {detail.rounds.map((r) => (
                  <span
                    key={r.n}
                    className={`round-cell ${r.won ? 'w' : 'l'}`}
                    title={`Ronda ${r.n} · ${r.won ? 'Ganada' : 'Perdida'} por ${resultEs(r.result)}${r.plantSite ? ` · planta en ${r.plantSite}${r.plantBy ? ` (${r.plantBy})` : ''}` : ''}${r.defuseBy ? ` · defusó ${r.defuseBy}` : ''}`}
                  >
                    <b className="rc-n">{r.n}</b>
                    <span className="rc-res">{resultIcon(r.result)}</span>
                    {r.plantSite ? <i className="rc-plant">◉</i> : null}
                  </span>
                ))}
              </div>
            </section>

            <section className="md-section">
              <h4>Tu combate</h4>
              <div className="combat-grid">
                <div className="combat-box">
                  <div className="cb-title">Duelos de apertura</div>
                  <div className="cb-duo">
                    <div className="cb-stat win">
                      <span className="num">{detail.combat.firstBloods}</span>
                      <span className="lbl">primeras sangres</span>
                    </div>
                    <div className="cb-vs">vs</div>
                    <div className="cb-stat loss">
                      <span className="num">{detail.combat.firstDeaths}</span>
                      <span className="lbl">primeras muertes</span>
                    </div>
                  </div>
                  <div className="cb-note">
                    {detail.combat.firstBloods > detail.combat.firstDeaths
                      ? '✅ Ganaste más duelos de apertura'
                      : detail.combat.firstBloods < detail.combat.firstDeaths
                        ? '⚠ Perdiste más duelos de apertura'
                        : 'Duelos de apertura parejos'}
                  </div>
                </div>

                <div className="combat-box">
                  <div className="cb-title">Quién te eliminó</div>
                  {detail.combat.topKillers.length ? (
                    <>
                      <div className="killer-list">
                        {detail.combat.topKillers.map((k) => (
                          <div key={k.name} className="killer-row">
                            <span className="k-name">{k.name}</span>
                            <span className="k-times">×{k.times}</span>
                          </div>
                        ))}
                      </div>
                      {detail.combat.otherDeaths > 0 && (
                        <p className="cb-note">
                          y {detail.combat.otherDeaths} más de {detail.combat.otherKillers} jugador{detail.combat.otherKillers !== 1 ? 'es' : ''}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="empty" style={{ padding: '8px 0' }}>Nadie te eliminó más de una vez.</p>
                  )}
                </div>
              </div>
            </section>

            <Scoreboard title={`Tu equipo · ${myPlayers.reduce((a, p) => a + p.kills, 0)} kills`} players={myPlayers} />
            <Scoreboard title={`Equipo rival · ${enemyPlayers.reduce((a, p) => a + p.kills, 0)} kills`} players={enemyPlayers} />
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Scoreboard({ title, players }: { title: string; players: DetailPlayer[] }) {
  if (!players.length) return null;
  return (
    <section className="md-section">
      <h4>{title}</h4>
      <div className="table-scroll">
        <table className="score-table">
          <thead>
            <tr>
              <th>Jugador</th><th>Agente</th><th className="num">Rango</th><th className="num">K/D/A</th>
              <th className="num">ACS</th><th className="num">ADR</th><th className="num">HS%</th>
              <th className="num">Daño ±</th><th className="num">Créditos</th><th className="num">Loadout</th>
            </tr>
          </thead>
          <tbody>
            {[...players]
              .sort((a, b) => Number(b.isMe) - Number(a.isMe) || b.acs - a.acs)
              .map((p) => (
                <tr key={p.name + p.tag} className={p.isMe ? 'me-row' : ''}>
                  <td>{p.name}<span className="muted-tag">#{p.tag}</span></td>
                  <td>{p.agentName}</td>
                  <td className="num"><TierIcon tier={p.tier} size={18} /></td>
                  <td className="num">{p.kills}/{p.deaths}/{p.assists}</td>
                  <td className="num">{p.acs}</td>
                  <td className="num">{p.adr}</td>
                  <td className="num">{p.hsPct.toFixed(1)}</td>
                  <td className="num">{p.dmgOut - p.dmgIn > 0 ? '+' : ''}{(p.dmgOut - p.dmgIn).toLocaleString('es')}</td>
                  <td className="num">{p.creditsSpent.toLocaleString('es')}</td>
                  <td className="num">{p.loadoutAvg.toLocaleString('es')}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function rrCls(v: number | null | undefined): string {
  if (v == null || v === 0) return '';
  return v > 0 ? 'up' : 'down';
}

const RESULT_ICONS: Record<string, string> = {
  elimination: '⚔',
  detonate: '💥',
  defuse: '✂',
  concede: '⏱',
  surrendered: '🏳',
};

const RESULT_ES: Record<string, string> = {
  elimination: 'Eliminación',
  detonate: 'Explosión del spike',
  defuse: 'Defusa',
  concede: 'Tiempo agotado',
  surrendered: 'Rendición',
};

function resultIcon(r?: string): string {
  return RESULT_ICONS[(r ?? '').toLowerCase()] ?? '·';
}

function resultEs(r?: string): string {
  return RESULT_ES[(r ?? '').toLowerCase()] ?? r ?? '—';
}

function escWeapon(w: string): string {
  return w.replace(/[&<>"]/g, '');
}
