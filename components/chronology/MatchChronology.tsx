'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMatchTimeline } from '@/lib/hooks';
import { roundClock, roundMoments, type TimelineKill, type TimelineMoment, type TimelinePlayer, type TimelineRound } from '@/lib/timelineView';
import { AgentIcon } from '@/components/AgentIcon';
import { MiniMap } from './MiniMap';

interface MatchChronologyProps {
  matchId: string;
  playerId?: string;
}

const RESULT_ES: Record<string, string> = {
  elimination: 'Eliminación',
  detonate: 'Explotó el spike',
  defuse: 'Defusaron',
  concede: 'Se agotó el tiempo',
  surrendered: 'Rendición',
};

/**
 * Cronología de la partida: ronda a ronda, quién mató a quién y con qué, sobre
 * el plano del mapa.
 *
 * El feed y el plano comparten el mismo índice de momento, así que tocar una
 * fila del feed mueve el plano a ese instante (y el scrubber los recorre todos
 * en orden). Todo el dato viene ya resuelto del servidor: aquí no se calcula
 * ninguna coordenada.
 */
export function MatchChronology({ matchId, playerId }: MatchChronologyProps) {
  const query = useMatchTimeline(matchId, playerId, true);
  const data = query.data;
  const error = query.error as (Error & { code?: string }) | null;

  const [roundIdx, setRoundIdx] = useState(0);
  const [momentIdx, setMomentIdx] = useState(0);
  const [playing, setPlaying] = useState(false);

  const rounds = useMemo(() => data?.rounds ?? [], [data]);
  const round = rounds[roundIdx] ?? null;
  const moments = useMemo(() => (round ? roundMoments(round) : []), [round]);
  const moment = moments[momentIdx] ?? null;

  // Reproducción: cada paso programa el siguiente y se detiene al final. El
  // setState va dentro del callback del timeout (no en el cuerpo del efecto),
  // que es lo que evita renders en cascada.
  useEffect(() => {
    if (!playing || moments.length === 0) return;
    const last = moments.length - 1;
    const id = setTimeout(() => {
      if (momentIdx >= last) {
        setPlaying(false);
        return;
      }
      setMomentIdx(momentIdx + 1);
    }, 1100);
    return () => clearTimeout(id);
  }, [playing, momentIdx, moments.length]);

  const score = useMemo(() => {
    let us = 0;
    for (let i = 0; i < rounds.length && i <= roundIdx; i++) if (rounds[i].won) us += 1;
    const played = Math.min(roundIdx + 1, rounds.length);
    return { us, them: played - us };
  }, [rounds, roundIdx]);

  function goRound(i: number) {
    setRoundIdx(i);
    setMomentIdx(0);
    setPlaying(false);
  }

  /** Play/pausa; si ya está en el último momento, rebobina y repite la ronda. */
  function togglePlay() {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (moments.length === 0) return;
    if (momentIdx >= moments.length - 1) setMomentIdx(0);
    setPlaying(true);
  }

  if (query.isLoading) return <p className="empty">Cargando cronología…</p>;
  if (error) return <p className="empty">{error.message}</p>;
  if (!data || !round) return <p className="empty">Esta partida no tiene rondas que mostrar.</p>;

  const myTeam = data.players.find((p) => p.isMe)?.team ?? null;
  const jump = (m: TimelineMoment) => {
    const i = moments.indexOf(m);
    if (i >= 0) {
      setMomentIdx(i);
      setPlaying(false);
    }
  };

  return (
    <div className="chrono">
      <div className="chrono-rail" role="tablist" aria-label="Rondas">
        {rounds.map((r, i) => (
          <button
            key={r.n}
            type="button"
            role="tab"
            aria-selected={i === roundIdx}
            className={`chrono-round ${r.won ? 'w' : 'l'}${i === roundIdx ? ' on' : ''}`}
            onClick={() => goRound(i)}
            title={roundTitle(r)}
          >
            <b>{r.n}</b>
            <span>{r.plant ? '◉' : resultGlyph(r.result)}</span>
          </button>
        ))}
      </div>

      <div className="chrono-body">
        <div className="chrono-left">
          <div className="chrono-head">
            <h4>
              Ronda {round.n}
              <span className={`res-badge ${round.won ? 'w' : 'l'}`}>{round.won ? 'Ganada' : 'Perdida'}</span>
            </h4>
            <span className="chrono-sub">
              {round.side ? `${round.side === 'atk' ? 'ATK' : 'DEF'} · ` : ''}
              {RESULT_ES[round.result.toLowerCase()] ?? round.result ?? '—'} · {score.us}–{score.them}
            </span>
          </div>

          <MiniMap
            image={data.map.image}
            players={data.players}
            moment={moment}
            kills={round.kills}
            myTeam={myTeam}
          />

          {data.map.calibration ? (
            <div className="chrono-scrub">
              <button
                type="button"
                className="chrono-play"
                onClick={togglePlay}
                disabled={moments.length === 0}
                aria-label={playing ? 'Pausar' : 'Reproducir la ronda'}
              >
                {playing ? '❚❚' : '▶'}
              </button>
              <input
                type="range"
                min={0}
                max={Math.max(0, moments.length - 1)}
                value={Math.min(momentIdx, Math.max(0, moments.length - 1))}
                onChange={(e) => {
                  setMomentIdx(Number(e.target.value));
                  setPlaying(false);
                }}
                disabled={moments.length === 0}
                aria-label="Momento de la ronda"
              />
              <span className="chrono-clock">{moment ? roundClock(moment.t) : '—:—'}</span>
            </div>
          ) : null}

          <p className="chrono-hint">
            {moment
              ? momentLabel(moment, data.players)
              : 'Esta ronda no tiene eventos con posición.'}
          </p>

          {data.map.calibration ? (
            <ul className="chrono-legend">
              <li><i className="lg-ring mine" /> tu equipo</li>
              <li><i className="lg-ring rival" /> rival</li>
              <li><i className="lg-ring me" /> tú</li>
              <li><i className="lg-cone" /> a dónde miraban</li>
              <li><i className="lg-kill">✕</i> la kill</li>
              <li><i className="lg-plant">◉</i> planta</li>
              <li><i className="lg-defuse">✂</i> defuse</li>
            </ul>
          ) : null}
        </div>

        <div className="chrono-right">
          <ol className="chrono-feed">
            {moments.length === 0 ? (
              <li className="empty">Sin eventos en esta ronda.</li>
            ) : (
              moments.map((m, i) => (
                <li key={`${m.kind}${m.t}${i}`}>
                  <button
                    type="button"
                    className={`chrono-row${i === momentIdx ? ' on' : ''}`}
                    onClick={() => jump(m)}
                  >
                    <span className="cr-time">{roundClock(m.t)}</span>
                    {m.kind === 'kill' && m.kill ? (
                      <KillRow kill={m.kill} players={data.players} myTeam={myTeam} />
                    ) : (
                      <EventRow moment={m} players={data.players} />
                    )}
                  </button>
                </li>
              ))
            )}
          </ol>

          {round.eco.length > 0 ? (
            <div className="chrono-eco">
              <div className="cb-title">Qué compró cada uno</div>
              <div className="eco-grid">
                {[...round.eco]
                  .sort((a, b) => b.loadout - a.loadout)
                  .map((e) => {
                    const p = data.players[e.p];
                    return (
                      <span key={e.p} className={`eco-chip${p?.isMe ? ' me' : ''}`}
                        title={`${p?.name ?? '?'}: ${e.weapon ?? 'sin arma'}${e.armor ? ` + ${e.armor}` : ''} · loadout ${e.loadout} · le quedaron ${e.left}`}>
                        <AgentIcon name={p?.agent ?? '?'} icon={p?.agentIcon} className="agent-icon sm" />
                        {e.icon ? <img className="eco-weapon" src={e.icon} alt="" loading="lazy" /> : null}
                        <span className="eco-txt">{e.weapon ?? '—'}</span>
                      </span>
                    );
                  })}
              </div>
            </div>
          ) : null}

          {data.notes.length > 0 ? (
            <ul className="chrono-notes">
              {data.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function KillRow({ kill, players, myTeam }: { kill: TimelineKill; players: TimelinePlayer[]; myTeam: string | null }) {
  const k = players[kill.k];
  const v = players[kill.v];
  const mine = k?.team != null && k.team === myTeam;
  return (
    <span className="cr-kill">
      <span className="cr-side">
        <AgentIcon name={k?.agent ?? '?'} icon={k?.agentIcon} className="agent-icon sm" />
        <span className={`cr-name${mine ? ' mine' : ''}`}>{k?.name ?? '?'}</span>
      </span>
      <span className={`cr-weapon${kill.w.inferred ? ' inferred' : ''}${kill.w.kind === 'ability' ? ' ability' : ''}`}
        title={`${kill.w.name}${kill.w.kind === 'ability' ? ' (habilidad)' : ''}${kill.w.secondary ? ' (disparo secundario)' : ''}${kill.w.inferred ? ' — deducido de su agente en la ronda' : ''}`}>
        {kill.w.icon ? <img src={kill.w.icon} alt="" loading="lazy" /> : null}
        <span className="cr-wname">{kill.w.inferred ? '≈' : ''}{kill.w.name}</span>
      </span>
      <span className="cr-arrow">→</span>
      <span className="cr-side">
        <AgentIcon name={v?.agent ?? '?'} icon={v?.agentIcon} className="agent-icon sm" />
        <span className={`cr-name${v?.isMe ? ' me' : ''}`}>{v?.name ?? '?'}</span>
      </span>
      <span className="cr-tags">
        {kill.first ? <i className="cr-tag fb" title="Primera sangre de la ronda">FB</i> : null}
        {kill.w.secondary ? <i className="cr-tag" title="Disparo secundario">2º</i> : null}
        {kill.a.length > 0 ? (
          <i className="cr-tag assist" title={`Asistencia de ${kill.a.map((i) => players[i]?.name).filter(Boolean).join(', ')}`}>
            +{kill.a.length}
          </i>
        ) : null}
      </span>
    </span>
  );
}

function EventRow({ moment, players }: { moment: TimelineMoment; players: TimelinePlayer[] }) {
  const isPlant = moment.kind === 'plant';
  return (
    <span className={`cr-event ${isPlant ? 'plant' : 'defuse'}`}>
      <span className="cr-event-icon">{isPlant ? '◉' : '✂'}</span>
      <span className="cr-name">{players[moment.by ?? -1]?.name ?? '?'}</span>
      <span className="cr-wname">
        {isPlant ? `plantó el spike${moment.site ? ` en ${moment.site}` : ''}` : 'defusó el spike'}
      </span>
    </span>
  );
}

function resultGlyph(result: string): string {
  switch (result.toLowerCase()) {
    case 'elimination':
      return '⚔';
    case 'detonate':
      return '💥';
    case 'defuse':
      return '✂';
    case 'surrendered':
      return '🏳';
    default:
      return '·';
  }
}

function roundTitle(r: TimelineRound): string {
  const bits = [`Ronda ${r.n}`, r.won ? 'ganada' : 'perdida'];
  if (r.side) bits.push(r.side === 'atk' ? 'ATK' : 'DEF');
  if (r.result) bits.push(RESULT_ES[r.result.toLowerCase()] ?? r.result);
  if (r.plant) bits.push(`planta en ${r.plant.site}`);
  if (r.defuse) bits.push('defusada');
  return bits.join(' · ');
}

function momentLabel(moment: TimelineMoment, players: TimelinePlayer[]): string {
  const at = roundClock(moment.t);
  if (moment.kind === 'kill' && moment.kill) {
    return `${at} · ${players[moment.kill.k]?.name ?? '?'} mata a ${players[moment.kill.v]?.name ?? '?'}`;
  }
  const by = players[moment.by ?? -1]?.name ?? '?';
  return `${at} · ${by} ${moment.kind === 'plant' ? 'planta el spike' : 'defusa el spike'}`;
}
