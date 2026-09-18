'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMatchDetail } from '@/lib/hooks';
import { TierIcon } from '@/components/TierIcon';
import { AgentIcon } from './AgentIcon';
import { LossBadge } from './LossBadge';
import type { MatchRow } from '@/lib/types';
import type { DetailPlayer, RoundCell } from '@/lib/matchDetail';

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

  const isDraw = match.roundsWon === match.roundsLost;
  const myTeamId = detail?.players.find((x) => x.isMe)?.teamId;
  const myPlayers = detail?.players.filter((p) => p.teamId === myTeamId) ?? [];
  const enemyPlayers = detail?.players.filter((p) => p.teamId !== myTeamId) ?? [];
  const playersByName = new Map((detail?.players ?? []).map((p) => [p.name, p]));
  const me = detail?.players.find((p) => p.isMe) ?? null;
  const others = detail?.players.filter((p) => !p.isMe) ?? [];
  const vsRows = me ? vsLobbyRows(me, others) : [];
  // Duelos de apertura: total desde las aperturas (mismo cálculo que ATK/DEF).
  const ap = detail?.aperturas ?? null;
  const fbTotal = ap ? ap.total.fb : (detail?.combat.firstBloods ?? 0);
  const fdTotal = ap ? ap.total.fd : (detail?.combat.firstDeaths ?? 0);
  const apSplit = ap && ap.atk.rounds + ap.def.rounds > 0 ? ap : null;

  return createPortal(
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>

        <header className="md-head">
          <div className="md-icons">
            {match.mapIcon ? <img className="map-icon" src={match.mapIcon} alt="" /> : null}
            <AgentIcon name={match.agent} icon={match.agentIcon} />
          </div>
          <div className="md-title">
            <h3>
              {match.map}
              <span className={`res-badge ${isDraw ? 'e' : match.won ? 'w' : 'l'}`}>
                {isDraw ? 'Empate' : match.won ? 'Victoria' : 'Derrota'}
              </span>
              <LossBadge m={match} />
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
              <div className="round-halves">
                {roundHalves(detail.rounds).map((h) => (
                  <div key={h.key} className="round-half">
                    <span className="rh-label">{h.label}</span>
                    <div className="round-strip">
                      {h.rounds.map((r) => (
                        <span key={r.n} className={`round-cell ${r.won ? 'w' : 'l'}`} title={roundTitle(r)}>
                          <b className="rc-n">{r.n}</b>
                          <span className="rc-res">{resultIcon(r.result)}</span>
                          {r.plantSite ? <i className="rc-plant">◉</i> : null}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="round-legend">
                {ROUND_LEGEND.map((l) => (
                  <span key={l.label}><b>{l.icon}</b> {l.label}</span>
                ))}
                <span><b>◉</b> planta (sitio A/B)</span>
              </p>
            </section>

            <Scoreboard title={`Tu equipo · ${myPlayers.reduce((a, p) => a + p.kills, 0)} kills`} players={myPlayers} />
            <Scoreboard title={`Equipo rival · ${enemyPlayers.reduce((a, p) => a + p.kills, 0)} kills`} players={enemyPlayers} />

            <section className="md-section">
              <h4>Tu combate</h4>
              <div className="combat-grid three">
                <div className="combat-box">
                  <div className="cb-title">Duelos de apertura</div>
                  <div className="cb-duo">
                    <div className="cb-stat win">
                      <span className="num">{fbTotal}</span>
                      <span className="lbl">primeras sangres</span>
                    </div>
                    <div className="cb-vs">vs</div>
                    <div className="cb-stat loss">
                      <span className="num">{fdTotal}</span>
                      <span className="lbl">primeras muertes</span>
                    </div>
                  </div>
                  {apSplit ? (
                    <div className="ap-split">
                      <span className="ap-head" />
                      <span className="ap-head">FB</span>
                      <span className="ap-head">FD</span>
                      <span className="ap-side" title={`${apSplit.atk.rounds} rondas de ataque`}>ATK</span>
                      <span className="ap-val fb">{apSplit.atk.rounds ? apSplit.atk.fb : '—'}</span>
                      <span className="ap-val fd">{apSplit.atk.rounds ? apSplit.atk.fd : '—'}</span>
                      <span className="ap-side" title={`${apSplit.def.rounds} rondas de defensa`}>DEF</span>
                      <span className="ap-val fb">{apSplit.def.rounds ? apSplit.def.fb : '—'}</span>
                      <span className="ap-val fd">{apSplit.def.rounds ? apSplit.def.fd : '—'}</span>
                    </div>
                  ) : null}
                  <div className="cb-note">
                    {fbTotal > fdTotal
                      ? '✅ Ganaste más duelos de apertura'
                      : fbTotal < fdTotal
                        ? '⚠ Perdiste más duelos de apertura'
                        : 'Duelos de apertura parejos'}
                  </div>
                  {apSplit && apSplit.sinLado > 0 ? (
                    <div className="cb-note">
                      {apSplit.sinLado} ronda{apSplit.sinLado === 1 ? '' : 's'} sin bando inferible (sin plantas) — no entran en ATK/DEF.
                    </div>
                  ) : null}
                </div>

                <div className="combat-box">
                  <div className="cb-title">Quién te eliminó</div>
                  {detail.combat.topKillers.length ? (
                    <>
                      <div className="killer-list">
                        {detail.combat.topKillers.map((k) => (
                          <div key={k.name} className="killer-row">
                            <KillerName name={k.name} icon={playersByName.get(k.name)?.agentIcon} />
                            <span className="k-weapon">{k.weapon && k.weapon !== '?' ? k.weapon : ''}</span>
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

                {vsRows.length ? (
                  <div className="combat-box">
                    <div className="cb-title">Tú vs el lobby</div>
                    <div className="vs-list">
                      {vsRows.map((r) => (
                        <div key={r.label} className="vs-row">
                          <span className="vs-label">{r.label}</span>
                          <b className="vs-me">{r.me}</b>
                          <span className={`vs-delta ${r.delta >= 0 ? 'up' : 'down'}`}>
                            {r.delta >= 0 ? '+' : ''}{r.delta.toFixed(0)}%
                          </span>
                          <span className="vs-avg">media {r.avg}</span>
                        </div>
                      ))}
                    </div>
                    <div className="cb-note">Media de los otros {others.length} jugadores de la partida.</div>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="md-section">
              <h4>Impacto</h4>
              <div className="combat-grid">
                <div className="combat-box">
                  <div className="cb-title">Bajas múltiples</div>
                  <div className="mk-row">
                    {MULTIKILLS.map((k) => {
                      const n = detail.multikills[k.key];
                      return (
                        <div
                          key={k.key}
                          className={`mk${n > 0 ? ' on' : ''}${k.key === 'five' && n > 0 ? ' ace' : ''}`}
                          title={`${k.full}: ${n} ronda${n === 1 ? '' : 's'}`}
                        >
                          <span className="n">{n}</span>
                          <span className="lbl">{k.label}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="cb-note">Rondas con esa cantidad de kills tuyas (5K = ace).</div>
                </div>

                <div className="combat-box">
                  <div className="cb-title">A quién mataste más</div>
                  {detail.topVictims.length ? (
                    <div className="killer-list">
                      {detail.topVictims.map((v) => (
                        <div key={v.name} className="killer-row">
                          <KillerName name={v.name} icon={playersByName.get(v.name)?.agentIcon} />
                          <span />
                          <span className="k-times kills">×{v.times}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="empty" style={{ padding: '8px 0' }}>Sin kills en esta partida.</p>
                  )}
                </div>
              </div>
            </section>
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
                  <td><AgentIcon name={p.agentName} icon={p.agentIcon} /></td>
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

/** Nombre del jugador con su icono de agente (los dos vienen del mismo DTO). */
function KillerName({ name, icon }: { name: string; icon: string | null | undefined }) {
  return (
    <span className="k-name">
      {icon ? <img className="agent-icon sm" src={icon} alt="" loading="lazy" /> : null}
      <span className="k-txt">{name}</span>
    </span>
  );
}

interface VsRow {
  label: string;
  me: string;
  avg: string;
  delta: number;
}

/** Tus KPI contra la media de los otros jugadores: todo sale del detalle ya cargado. */
function vsLobbyRows(me: DetailPlayer, others: DetailPlayer[]): VsRow[] {
  if (!others.length) return [];
  const kdOf = (p: DetailPlayer) => p.kills / Math.max(1, p.deaths);
  const mean = (pick: (p: DetailPlayer) => number) => others.reduce((a, p) => a + pick(p), 0) / others.length;
  const rows: { label: string; pick: (p: DetailPlayer) => number; fmt: (v: number) => string }[] = [
    { label: 'ACS', pick: (p) => p.acs, fmt: (v) => v.toFixed(0) },
    { label: 'K/D', pick: kdOf, fmt: (v) => v.toFixed(2) },
    { label: 'ADR', pick: (p) => p.adr, fmt: (v) => v.toFixed(0) },
    { label: 'HS%', pick: (p) => p.hsPct, fmt: (v) => `${v.toFixed(1)}%` },
  ];
  return rows.map((r) => {
    const mine = r.pick(me);
    const avg = mean(r.pick);
    return {
      label: r.label,
      me: r.fmt(mine),
      avg: r.fmt(avg),
      delta: avg > 0 ? ((mine - avg) / avg) * 100 : 0,
    };
  });
}

interface RoundHalf {
  key: string;
  label: string;
  rounds: RoundCell[];
}

/** Rondas por mitades (1ª: 1-12, 2ª: 13-24, OT: 25+) con el bando inferido. */
function roundHalves(rounds: RoundCell[]): RoundHalf[] {
  const groups = [
    { key: 'h1', base: '1ª mitad', rounds: rounds.filter((r) => r.n <= 12) },
    { key: 'h2', base: '2ª mitad', rounds: rounds.filter((r) => r.n > 12 && r.n <= 24) },
    { key: 'ot', base: 'OT', rounds: rounds.filter((r) => r.n > 24) },
  ];
  return groups
    .filter((g) => g.rounds.length > 0)
    .map((g) => {
      // La OT alterna bando por ronda: solo se etiqueta la mitad.
      const side = g.rounds.find((r) => r.side != null)?.side ?? null;
      const suffix = g.key !== 'ot' && side != null ? ` · ${side === 1 ? 'ATK' : 'DEF'}` : '';
      return { key: g.key, label: `${g.base}${suffix}`, rounds: g.rounds };
    });
}

/** Tooltip de una celda del timeline (incluye el bando cuando se conoce). */
function roundTitle(r: RoundCell): string {
  const side = r.side == null ? '' : ` · ${r.side === 1 ? 'ATK' : 'DEF'}`;
  const plant = r.plantSite ? ` · planta en ${r.plantSite}${r.plantBy ? ` (${r.plantBy})` : ''}` : '';
  const defuse = r.defuseBy ? ` · defusó ${r.defuseBy}` : '';
  return `Ronda ${r.n}${side} · ${r.won ? 'Ganada' : 'Perdida'} por ${resultEs(r.result)}${plant}${defuse}`;
}

const ROUND_LEGEND = [
  { icon: '⚔', label: 'eliminación' },
  { icon: '💥', label: 'spike' },
  { icon: '✂', label: 'defuse' },
  { icon: '⏱', label: 'tiempo' },
  { icon: '🏳', label: 'rendición' },
];

const MULTIKILLS: { key: 'two' | 'three' | 'four' | 'five'; label: string; full: string }[] = [
  { key: 'two', label: '2K', full: 'Dobles' },
  { key: 'three', label: '3K', full: 'Triples' },
  { key: 'four', label: '4K', full: 'Cuádruples' },
  { key: 'five', label: '5K', full: 'Ace' },
];

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
