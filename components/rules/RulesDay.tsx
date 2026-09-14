'use client';

import { useState } from 'react';
import { esc } from '@/lib/metas';
import { tierShort } from '@/lib/ranks';
import { isDraw, STOP_KD, type DayEvaluation, type EvaluatedMatch, type PickClass } from '@/lib/rules';
import type { SessionRules } from '@/lib/profileTypes';
import type { MatchComment } from '@/lib/matchComments';

interface RulesDayProps {
  day: DayEvaluation;
  comments: Record<string, MatchComment>;
  onSaveComment: (matchId: string, text: string) => Promise<void>;
  /** Abierto por defecto (sugerencia: solo el día más reciente). */
  defaultOpen?: boolean;
  /** Reglas del perfil (para el umbral de K/D mostrado). */
  rules?: SessionRules;
  /** Modo controlado (acordeón en móvil): si viene, manda sobre el estado interno. */
  open?: boolean;
  onToggle?: (open: boolean) => void;
}

function resultBadge(m: EvaluatedMatch): { cls: string; text: string } {
  if (isDraw(m.match)) return { cls: 'e', text: 'E' };
  return m.match.won ? { cls: 'w', text: 'V' } : { cls: 'l', text: 'D' };
}

/** Badge de la clasificación del pick contra el pool del perfil. */
function pickBadge(p: PickClass): { cls: string; text: string; title: string } | null {
  if (p === 'main') return { cls: 'main', text: 'M', title: 'Principal del mapa' };
  if (p === 'backup') return { cls: 'backup', text: 'B', title: 'Backup' };
  if (p === 'off') return { cls: 'pool', text: 'P', title: 'Fuera de pool' };
  if (p === 'banned') return { cls: 'banned', text: 'X', title: 'Prohibido (agente o rol vetado)' };
  return null;
}

function recordText(wins: number, losses: number, draws: number): string {
  return `${wins}V-${losses}D${draws ? `-${draws}E` : ''}`;
}

/** Estado de la partida frente a las reglas (columna «Reglas» y tarjetas móviles). */
function ruleStateLabel(r: EvaluatedMatch, stopKd: number): string {
  if (r.cutPoint) return 'CORTE AQUÍ';
  if (r.afterCut) return 'no debiste jugarla';
  if (r.pickClass === 'banned') return 'prohibido';
  if (r.violation) return 'fuera de pool';
  if (!r.match.won && !isDraw(r.match) && r.kd >= stopKd) return 'kd ok · no suma';
  return '';
}

export function RulesDay({ day, comments, onSaveComment, defaultOpen = false, rules, open: openProp, onToggle }: RulesDayProps) {
  const stopKd = rules?.stop.kdBelow ?? STOP_KD;
  const [openState, setOpenState] = useState(defaultOpen);
  const open = openProp ?? openState;
  const toggleOpen = () => {
    const next = !open;
    if (openProp === undefined) setOpenState(next);
    onToggle?.(next);
  };
  const rows = day.matches;

  return (
    <div className="panel rules-day">
      <button
        className="rules-day-head"
        onClick={toggleOpen}
        aria-expanded={open}
        aria-controls={`rules-body-${day.key}`}
      >
        <span className={`day-chevron${open ? ' on' : ''}`} aria-hidden>▸</span>
        <span className="rules-day-date">{day.label}</span>
        <span className="rules-day-record">
          {recordText(day.wins, day.losses, day.draws)}
          {day.storedMatches != null && day.storedMatches > rows.length ? ` · ${day.storedMatches}p guardadas` : ''}
        </span>
        <span className="rules-day-rr">
          {day.endTier > 0 ? tierShort(day.endTier) : '—'}
        </span>
        <span className="rules-day-meta">
          {day.cutAt ? (
            <span className={`rules-cut-badge${day.cutIgnored ? ' ignored' : ''}`}>
              {day.cutIgnored ? `corte en ${day.cutAt} · ignorado` : `corte en ${day.cutAt}`}
            </span>
          ) : null}
          {day.violationCount > 0 ? (
            <span className="rules-pool-badge">
              {day.violationCount} fuera de pool{day.bannedCount ? ` · ${day.bannedCount} prohibidos` : ''}
            </span>
          ) : null}
          {day.stored ? (
            <span className="rules-warn" title="Evaluación recuperada del snapshot guardado">guardado</span>
          ) : null}
        </span>
      </button>

      {open && (
        <div id={`rules-body-${day.key}`} className="rules-day-body">
          <div className="rules-stats">
            <div className="rules-stat">
              <span className="rules-stat-lbl">Récord real</span>
              <span className={`rules-stat-val ${day.losses > day.wins ? 'loss' : 'win'}`}>
                {recordText(day.wins, day.losses, day.draws)}
              </span>
            </div>
            <div className="rules-stat">
              <span className="rules-stat-lbl">Con regla</span>
              <span className="rules-stat-val mute">{recordText(day.planWins, day.planLosses, day.planDraws)}</span>
            </div>
            <div className="rules-stat">
              <span className="rules-stat-lbl">Regla + pool</span>
              <span className="rules-stat-val mute">{recordText(day.poolWins, day.poolLosses, day.poolDraws)}</span>
            </div>
            {day.violationCount > 0 ? (
              <div className="rules-stat">
                <span className="rules-stat-lbl">Derrotas de pool</span>
                <span
                  className="rules-stat-val loss"
                  title={`Récord de las partidas fuera de pool/prohibidas: ${day.violationWins}V-${day.violationLosses}D`}
                >
                  {day.violationLosses}
                </span>
              </div>
            ) : null}
            <div className="rules-stat">
              <span className="rules-stat-lbl">Sesiones</span>
              <span className="rules-stat-val neutral">{day.sessions}</span>
            </div>
            {day.fbTotal != null && day.fdTotal != null ? (
              <div className="rules-stat">
                <span className="rules-stat-lbl">FB/FD</span>
                <span
                  className={`rules-stat-val ${day.fbTotal - day.fdTotal >= 0 ? 'win' : 'loss'}`}
                  title={`Primeras sangres / primeras muertes · meta FB ≥ 2.5 y FD ≤ 2.0 por partida${day.fdHighCount ? ` · ${day.fdHighCount} partida(s) con 3+ FD` : ''}`}
                >
                  {day.fbTotal}/{day.fdTotal}
                </span>
              </div>
            ) : null}
          </div>

          <p className="rules-rule-hint">
            Corte: 2 derrotas seguidas con K/D &lt; 0.9. Solo las derrotas con K/D &lt; 0.9 suman al
            contador (las de buen K/D no son tilt, no cuentan) · una victoria reinicia · el empate no reinicia.
            {' '}Impacto: FB ≥ 2.5 y FD ≤ 2.0 por partida; a la 3.ª primera muerte, modo &quot;no regalar&quot;.
          </p>

          {/* Tira de partidas del día (reemplaza las barras de RR) */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '6px 2px' }}>
            {rows.map((r) => {
              const badge = resultBadge(r);
              const pick = pickBadge(r.pickClass);
              const hora = new Date(r.match.timestamp).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
              return (
                <span
                  key={r.match.matchId}
                  title={`${r.match.map} · ${r.match.agent} · ${r.match.roundsWon}-${r.match.roundsLost} · K/D ${r.kd.toFixed(2)}${r.cutPoint ? ' · CORTE' : r.afterCut ? ' · no debiste jugarla' : ''}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '3px 8px',
                    border: '1px solid',
                    borderColor: r.violation ? '#ff5c69' : r.cutPoint ? '#e8c97a' : '#2a3b4d',
                    borderRadius: 6,
                    opacity: r.afterCut ? 0.5 : 1,
                    whiteSpace: 'nowrap',
                    fontSize: 12,
                  }}
                >
                  <b>{hora}</b>
                  <span className={`res-badge ${badge.cls}`}>{badge.text}</span>
                  <span>{esc(r.match.map)} · {esc(r.match.agent)}</span>
                  {pick ? <span className={`res-badge ${pick.cls}`} title={pick.title}>{pick.text}</span> : null}
                  {r.cutPoint ? <b style={{ color: '#e8c97a' }}>CORTE</b> : null}
                </span>
              );
            })}
          </div>

          <div className="table-scroll desktop-only">
            <table className="score-table rules-table">
              <thead>
                <tr>
                  <th>Hora</th><th>Mapa · Agente</th><th>Marcador</th><th>Resultado</th>
                  <th className="num">K/D</th><th className="num">FB/FD</th><th className="num" title="Contador de la regla de parada (derrotas con K/D bajo)">Parada</th><th>Reglas</th><th>Nota</th>
                </tr>
              </thead>
              <tbody>
                {[...rows].reverse().map((r) => {
                  const badge = resultBadge(r);
                  const pick = pickBadge(r.pickClass);
                  return (
                    <tr key={r.match.matchId} className={`${r.cutPoint ? 'rules-cut-row' : ''}${r.afterCut ? 'row-skip' : ''}`}>
                      <td>{new Date(r.match.timestamp).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</td>
                      <td>
                        <span className="icon-cell">
                          {r.match.mapIcon ? <img className="map-icon" src={r.match.mapIcon} alt="" loading="lazy" /> : null}
                          {esc(r.match.map)} · {esc(r.match.agent)}
                        </span>
                      </td>
                      <td className="num">{r.match.roundsWon}–{r.match.roundsLost}</td>
                      <td>
                        <span className={`res-badge ${badge.cls}`}>{badge.text}</span>
                        {pick ? <span className={`res-badge ${pick.cls}`} title={pick.title}>{pick.text}</span> : null}
                      </td>
                      <td className={`num${r.kd >= 1 ? ' stat-ok' : ''}`}>{r.kd.toFixed(2)}</td>
                      <td
                        className={`num${
                          r.match.firstBloods == null
                            ? ''
                            : (r.match.firstDeaths ?? 0) >= 3
                              ? ' stat-loss'
                              : (r.match.firstBloods ?? 0) > (r.match.firstDeaths ?? 0)
                                ? ' stat-win'
                                : ''
                        }`}
                        title={
                          r.match.firstBloods == null
                            ? 'Sin detalle de kill feed'
                            : `Primeras sangres ${r.match.firstBloods} · primeras muertes ${r.match.firstDeaths}${(r.match.firstDeaths ?? 0) >= 3 ? ' · 3+ FD: modo "no regalar"' : ''}`
                        }
                      >
                        {r.match.firstBloods == null ? '·' : `${r.match.firstBloods}/${r.match.firstDeaths}`}
                      </td>
                      <td className={`num ${r.cutPoint ? 'rules-cut-num' : ''}`}>{r.afterCut ? '—' : r.counterAfter}</td>
                      <td className="rules-note-cell">
                        {ruleStateLabel(r, stopKd)}
                      </td>
                      <td>
                        <NoteCell
                          matchId={r.match.matchId}
                          comment={comments[r.match.matchId]}
                          onSave={onSaveComment}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Móvil: mismas partidas en tarjetas (sin tabla de 9 columnas) */}
          <div className="rules-matches-cards">
            {[...rows].reverse().map((r) => {
              const badge = resultBadge(r);
              const pick = pickBadge(r.pickClass);
              const state = ruleStateLabel(r, stopKd);
              return (
                <div
                  key={r.match.matchId}
                  className={`rules-match-card${r.cutPoint ? ' cut' : ''}${r.afterCut ? ' skip' : ''}`}
                >
                  <span className={`res-badge ${badge.cls}`}>{badge.text}</span>
                  <div className="rmc-main">
                    <div className="rmc-line1">
                      <b>{new Date(r.match.timestamp).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</b>
                      <span className="mc-dot">·</span>
                      {r.match.mapIcon ? <img className="map-icon" src={r.match.mapIcon} alt="" loading="lazy" /> : null}
                      {esc(r.match.map)}
                      <span className="mc-dot">·</span>
                      {r.match.agentIcon ? <img className="agent-icon" src={r.match.agentIcon} alt="" loading="lazy" /> : null}
                      {esc(r.match.agent)}
                      {pick ? <span className={`res-badge ${pick.cls}`} title={pick.title}>{pick.text}</span> : null}
                    </div>
                    <div className="rmc-line2">
                      <b>{r.match.roundsWon}–{r.match.roundsLost}</b>
                      <span className="mc-dot">·</span>
                      K/D <b className={r.kd >= 1 ? 'stat-ok' : ''}>{r.kd.toFixed(2)}</b>
                    </div>
                    {state ? (
                      <div className={`rmc-state${r.cutPoint || r.afterCut || r.violation ? ' bad' : ''}`}>{state}</div>
                    ) : null}
                  </div>
                  <NoteCell matchId={r.match.matchId} comment={comments[r.match.matchId]} onSave={onSaveComment} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function NoteCell({ matchId, comment, onSave }: {
  matchId: string;
  comment?: MatchComment;
  onSave: (matchId: string, text: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(comment?.text ?? '');
  const [saving, setSaving] = useState(false);

  const start = () => {
    setText(comment?.text ?? '');
    setEditing(true);
  };
  const save = async () => {
    setSaving(true);
    try {
      await onSave(matchId, text);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return comment ? (
      <button className="rules-note-btn has" onClick={start} title={comment.text}>
        {comment.text.length > 40 ? `${comment.text.slice(0, 40)}…` : comment.text}
      </button>
    ) : (
      <button className="rules-note-btn" onClick={start}>+ nota</button>
    );
  }
  return (
    <div className="rules-note-edit">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Qué pasó / por qué este resultado…"
        rows={3}
        autoFocus
      />
      <div className="rules-note-actions">
        <button className="f-chip" onClick={save} disabled={saving}>
          {saving ? 'Guardando…' : text.trim() ? 'Guardar' : 'Borrar nota'}
        </button>
        <button className="f-chip" onClick={() => setEditing(false)} disabled={saving}>Cancelar</button>
      </div>
    </div>
  );
}
