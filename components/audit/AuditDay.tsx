'use client';

import { useState } from 'react';
import { esc } from '@/lib/metas';
import { useElementWidth } from '@/lib/useElementWidth';
import type { MatchRow } from '@/lib/types';
import { isDraw, STOP_KD, type AuditDay, type AuditMatchRow, type PickClass } from '@/lib/audit';
import type { AuditRules } from '@/lib/profileTypes';
import type { MatchComment } from '@/lib/matchComments';

interface AuditDayProps {
  day: AuditDay;
  comments: Record<string, MatchComment>;
  onSaveComment: (matchId: string, text: string) => Promise<void>;
  /** Abierto por defecto (sugerencia: solo el día más reciente). */
  defaultOpen?: boolean;
  /** Reglas del perfil (para el umbral de K/D mostrado). */
  rules?: AuditRules;
}

const W = 940;
const PL = 50;
const PR = 24;
const BAR_MAX_RR = 20;
const BASELINE = 120;
const TOP = 18;
const BOTTOM = 252;

function rrColor(m: MatchRow): string {
  return isDraw(m) ? '#e8c97a' : m.won ? '#2fd08a' : '#ff5c69';
}

function resultBadge(m: AuditMatchRow): { cls: string; text: string } {
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

function fmtRR(v: number | null): string {
  return v == null ? '—' : `${v > 0 ? '+' : ''}${v}`;
}

export function AuditDay({ day, comments, onSaveComment, defaultOpen = false, rules }: AuditDayProps) {
  const stopKd = rules?.stop.kdBelow ?? STOP_KD;
  const [open, setOpen] = useState(defaultOpen);
  /** Partida seleccionada al tocar una barra (reemplaza el tooltip en táctil). */
  const [sel, setSel] = useState<number | null>(null);
  // Ancho real medido: en compacto el SVG se dibuja en píxeles reales con un
  // mínimo de 46px por partida (táctil); en escritorio se mantiene el 940 fijo.
  const { ref: boxRef, width: boxW } = useElementWidth(940);
  const rows = day.matches;
  const n = Math.max(1, rows.length);
  const compact = boxW < 640;
  const plotW = compact ? Math.max(Math.round(boxW), n * 46) - (compact ? 34 : PL) - (compact ? 14 : PR) : W - PL - PR;
  const Wc = compact ? plotW + 34 + 14 : W;
  const PLc = compact ? 34 : PL;
  const PRc = compact ? 14 : PR;
  const TOPc = compact ? 14 : TOP;
  const BASELINEc = compact ? 96 : BASELINE;
  const BOTTOMc = compact ? 196 : BOTTOM;
  const slotW = plotW / n;
  const barW = Math.min(compact ? 34 : 48, slotW * (compact ? 0.72 : 0.62));
  const cx = (i: number) => PLc + slotW * i + slotW / 2;
  const scale = compact ? 3.1 : 3.6; // px por RR

  const cutIdx = rows.findIndex((r) => r.cutPoint);
  const cutX = cutIdx >= 0 ? cx(cutIdx) + slotW / 2 : null;
  const tapeId = `tape-${day.key}`;

  const wins = rows.filter((r) => r.match.won && !isDraw(r.match)).length;
  const draws = rows.filter((r) => isDraw(r.match)).length;
  const losses = rows.length - wins - draws;

  const sessionBands: { from: number; to: number }[] = [];
  let sStart = 0;
  for (let i = 1; i <= rows.length; i++) {
    if (i === rows.length || rows[i].session !== rows[i - 1].session) {
      sessionBands.push({ from: sStart, to: i });
      sStart = i;
    }
  }

  return (
    <div className="panel audit-day">
      <button
        className="audit-day-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={`audit-body-${day.key}`}
      >
        <span className={`day-chevron${open ? ' on' : ''}`} aria-hidden>▸</span>
        <span className="audit-day-date">{day.label}</span>
        <span className="audit-day-record">
          {wins}V-{losses}D{draws ? `-${draws}E` : ''}
          {day.storedMatches != null && day.storedMatches > rows.length ? ` · RR de ${day.storedMatches}p` : ''}
        </span>
        <span className={`audit-day-rr ${(day.realRR ?? 0) < 0 ? 'loss' : 'win'}`}>{fmtRR(day.realRR)} RR</span>
        <span className="audit-day-meta">
          {day.cutAt ? (
            <span className={`audit-cut-badge${day.cutIgnored ? ' ignored' : ''}`}>
              {day.cutIgnored ? `corte en ${day.cutAt} · ignorado` : `corte en ${day.cutAt}`}
            </span>
          ) : null}
          {day.violationCount > 0 ? (
            <span className="audit-pool-badge">
              {day.violationCount} fuera de pool{day.bannedCount ? ` · ${day.bannedCount} prohibidos` : ''}
            </span>
          ) : null}
          {day.stored ? (
            <span className="audit-warn" title="RR recuperado del snapshot guardado (la API ya no lo devuelve)">guardado</span>
          ) : null}
          {day.rrMissing > 0 ? (
            <span className="audit-warn">RR parcial ({day.rrMissing} sin dato)</span>
          ) : null}
        </span>
      </button>

      {open && (
        <div id={`audit-body-${day.key}`} className="audit-day-body">
          <div className="audit-stats">
            <div className="audit-stat">
              <span className="audit-stat-lbl">RR real</span>
              <span className={`audit-stat-val ${(day.realRR ?? 0) < 0 ? 'loss' : 'win'}`}>{fmtRR(day.realRR)}</span>
            </div>
            <div className="audit-stat">
              <span className="audit-stat-lbl">Con regla</span>
              <span className="audit-stat-val mute">{fmtRR(day.planRR)}</span>
            </div>
            <div className="audit-stat">
              <span className="audit-stat-lbl">Regla + pool</span>
              <span className="audit-stat-val mute">{fmtRR(day.planPoolRR)}</span>
            </div>
            {day.violationCount > 0 ? (
              <div className="audit-stat">
                <span className="audit-stat-lbl">Costo pool</span>
                <span
                  className="audit-stat-val loss"
                  title={
                    day.violationGain
                      ? `Balance neto ${fmtRR(day.violationCost)} (ganado fuera de pool: +${day.violationGain})`
                      : 'RR perdido en partidas fuera de pool'
                  }
                >
                  {fmtRR(day.violationLoss)}
                </span>
              </div>
            ) : null}
            <div className="audit-stat">
              <span className="audit-stat-lbl">Sesiones</span>
              <span className="audit-stat-val neutral">{day.sessions}</span>
            </div>
            {day.fbTotal != null && day.fdTotal != null ? (
              <div className="audit-stat">
                <span className="audit-stat-lbl">FB/FD</span>
                <span
                  className={`audit-stat-val ${day.fbTotal - day.fdTotal >= 0 ? 'win' : 'loss'}`}
                  title={`Primeras sangres / primeras muertes · meta FB ≥ 2.5 y FD ≤ 2.0 por partida${day.fdHighCount ? ` · ${day.fdHighCount} partida(s) con 3+ FD` : ''}`}
                >
                  {day.fbTotal}/{day.fdTotal}
                </span>
              </div>
            ) : null}
          </div>

          <p className="audit-rule-hint">
            Corte: 2 derrotas seguidas con K/D &lt; 0.9. Solo las derrotas con K/D &lt; 0.9 suman al
            contador (las de buen K/D no son tilt, no cuentan) · una victoria reinicia · el empate no reinicia.
            {' '}Impacto: FB ≥ 2.5 y FD ≤ 2.0 por partida; a la 3.ª primera muerte, modo &quot;no regalar&quot;.
          </p>

          {sel != null && rows[sel] ? (
            <div className="audit-tap-info">
              <b>{new Date(rows[sel].match.timestamp).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</b>
              {' · '}{esc(rows[sel].match.map)} · {esc(rows[sel].match.agent)}
              {' · '}{rows[sel].match.roundsWon}–{rows[sel].match.roundsLost}
              {' · '}K/D {rows[sel].kd.toFixed(2)}
              {' · '}{rows[sel].match.rrDelta == null ? 'sin RR' : `${rows[sel].match.rrDelta > 0 ? '+' : ''}${rows[sel].match.rrDelta} RR`}
            </div>
          ) : null}

          <div className="audit-svg-scroll" ref={boxRef}>
            <svg style={{ width: '100%', minWidth: Wc }} viewBox={`0 0 ${Wc} ${BOTTOMc + 16}`} role="img" aria-label={`RR por partida — ${day.label}`}>
              <defs>
                <pattern id={tapeId} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="9" height="9" fill="#e8c97a" />
                  <rect width="4.5" height="9" fill="#0f1923" />
                </pattern>
              </defs>
              {/* bandas de sesión */}
              {sessionBands.map((b, i) => (
                <rect
                  key={i}
                  x={PLc + slotW * b.from}
                  y={TOPc}
                  width={slotW * (b.to - b.from)}
                  height={BOTTOMc - TOPc}
                  fill={i % 2 ? 'rgba(147,164,179,0.05)' : 'rgba(147,164,179,0.02)'}
                />
              ))}
              {/* línea base */}
              <line x1={PLc} y1={BASELINEc} x2={Wc - PRc} y2={BASELINEc} stroke="#34495e" strokeWidth="1" />
              {/* cinta de peligro del corte */}
              {cutX != null ? (
                <g>
                  <rect x={cutX - 3} y={TOPc} width={6} height={BOTTOMc - TOPc} fill={`url(#${tapeId})`} opacity="0.9" />
                  <text
                    x={cutX - 9}
                    y={compact ? 24 : 36}
                    fontSize={compact ? 11 : 10}
                    fontWeight="700"
                    fill="#e8c97a"
                    textAnchor="end"
                    letterSpacing="1"
                  >
                    CORTE · {day.cutAt}
                  </text>
                  <text x={cutX - 9} y={compact ? 38 : 50} fontSize={compact ? 10 : 9} fill="#93a4b3" textAnchor="end">
                    no debiste jugar
                  </text>
                </g>
              ) : null}
              {/* violaciones de pool */}
              {rows.map((r, i) =>
                r.violation ? (
                  <rect
                    key={`p${i}`}
                    x={cx(i) - slotW / 2 + 3}
                    y={TOPc}
                    width={slotW - 6}
                    height={BOTTOMc - TOPc}
                    fill="none"
                    stroke="#ff5c69"
                    strokeWidth="1"
                    strokeDasharray="4 3"
                    opacity="0.6"
                  />
                ) : null,
              )}
              {/* barras */}
              {rows.map((r, i) => {
                const has = r.match.rrDelta != null;
                const rr = r.match.rrDelta ?? 0;
                const x = cx(i) - barW / 2;
                if (!has) {
                  return (
                    <line
                      key={i}
                      x1={cx(i) - 3}
                      x2={cx(i) + 3}
                      y1={BASELINEc}
                      y2={BASELINEc}
                      stroke={sel === i ? '#ece8e1' : '#5d7080'}
                      strokeWidth="2.5"
                      opacity={r.afterCut ? 0.4 : 1}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSel(sel === i ? null : i)}
                    >
                      <title>{`${r.match.map} · ${r.match.agent} · ${r.match.roundsWon}-${r.match.roundsLost} · K/D ${r.kd.toFixed(2)} · RR sin dato`}</title>
                    </line>
                  );
                }
                const h = Math.min(Math.abs(rr) * scale, BAR_MAX_RR * scale);
                const y = rr >= 0 ? BASELINEc - h : BASELINEc;
                return (
                  <rect
                    key={i}
                    x={x}
                    y={y}
                    width={barW}
                    height={Math.max(2.5, h)}
                    fill={rrColor(r.match)}
                    opacity={r.afterCut ? 0.38 : 1}
                    stroke={sel === i ? '#ece8e1' : r.violation ? '#ff4655' : undefined}
                    strokeWidth={sel === i ? 2 : r.violation ? 1.4 : undefined}
                    strokeDasharray={r.violation && sel !== i ? '4 3' : undefined}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSel(sel === i ? null : i)}
                  >
                    <title>{`${r.match.map} · ${r.match.agent} · ${r.match.roundsWon}-${r.match.roundsLost} · K/D ${r.kd.toFixed(2)} · ${rr > 0 ? '+' : ''}${rr} RR`}</title>
                  </rect>
                );
              })}
              {/* valores (alineados con la barra capada y clampados al lienzo) */}
              <g fontSize={compact ? 11 : 10.5} fontWeight="700" textAnchor="middle">
                {rows.map((r, i) => {
                  if (r.match.rrDelta == null) {
                    return (
                      <text key={i} x={cx(i)} y={BASELINEc + 14} fill="#5d7080">
                        ·
                      </text>
                    );
                  }
                  const rr = r.match.rrDelta;
                  const h = Math.min(Math.abs(rr) * scale, BAR_MAX_RR * scale);
                  const y = rr > 0 ? BASELINEc - h - 7 : BASELINEc + h + 14;
                  return (
                    <text
                      key={i}
                      x={cx(i)}
                      y={Math.min(BOTTOMc - 26, Math.max(TOPc + 2, y))}
                      fill={rrColor(r.match)}
                      opacity={r.afterCut ? 0.6 : 1}
                    >
                      {rr > 0 ? '+' : ''}{rr}
                    </text>
                  );
                })}
              </g>
              {/* hora / mapa / contador */}
              <g fontSize={compact ? 10.5 : 9.5} fill="#93a4b3" textAnchor="middle">
                {rows.map((r, i) => (
                  <text key={i} x={cx(i)} y={BOTTOMc - 42}>
                    {new Date(r.match.timestamp).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                  </text>
                ))}
              </g>
              <g fontSize={compact ? 10 : 8.5} fill="#5d7080" textAnchor="middle">
                {rows.map((r, i) => (
                  <text key={i} x={cx(i)} y={BOTTOMc - 27}>
                    {esc(r.match.map)}
                  </text>
                ))}
              </g>
              <g fontSize={compact ? 10.5 : 9} fontWeight="700" textAnchor="middle">
                {rows.map((r, i) => (
                  <text
                    key={i}
                    x={cx(i)}
                    y={BOTTOMc - 10}
                    fill={r.cutPoint ? '#ff5c69' : r.counterAfter >= 1 ? '#e8c97a' : '#5d7080'}
                  >
                    {r.afterCut ? 'no jugar' : `cont ${r.counterAfter}`}
                  </text>
                ))}
              </g>
            </svg>
          </div>

          <AuditCumulative day={day} W={Wc} PL={PLc} PR={PRc} compact={compact} sel={sel} onPick={setSel} />

          <div className="table-scroll">
            <table className="score-table audit-table">
              <thead>
                <tr>
                  <th>Hora</th><th>Mapa · Agente</th><th>Marcador</th><th>Resultado</th>
                  <th className="num">K/D</th><th className="num">FB/FD</th><th className="num">RR</th><th className="num">Cont</th><th>Auditoría</th><th>Nota</th>
                </tr>
              </thead>
              <tbody>
                {[...rows].reverse().map((r) => {
                  const badge = resultBadge(r);
                  const pick = pickBadge(r.pickClass);
                  return (
                    <tr key={r.match.matchId} className={`${r.cutPoint ? 'audit-cut-row' : ''}${r.afterCut ? 'row-skip' : ''}`}>
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
                      <td className={`num ${r.match.rrDelta == null ? '' : r.match.rrDelta > 0 ? 'stat-win' : 'stat-loss'}`}>
                        {r.match.rrDelta == null ? '·' : `${r.match.rrDelta > 0 ? '+' : ''}${r.match.rrDelta}`}
                      </td>
                      <td className={`num ${r.cutPoint ? 'audit-cut-num' : ''}`}>{r.afterCut ? '—' : r.counterAfter}</td>
                      <td className="audit-note-cell">
                        {r.cutPoint
                          ? 'CORTE AQUÍ'
                          : r.afterCut
                            ? 'no debiste jugarla'
                            : r.pickClass === 'banned'
                              ? 'prohibido'
                              : r.violation
                                ? 'fuera de pool'
                                : !r.match.won && !isDraw(r.match) && r.kd >= stopKd
                                  ? 'kd ok · no suma'
                                  : ''}
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
        </div>
      )}
    </div>
  );
}

function niceStep(range: number): number {
  const raw = range / 5;
  for (const s of [2, 5, 10, 20, 25, 50, 100]) if (raw <= s) return s;
  return 200;
}

function AuditCumulative({ day, W, PL, PR, compact, sel, onPick }: {
  day: AuditDay;
  W: number;
  PL: number;
  PR: number;
  compact: boolean;
  sel: number | null;
  onPick: (i: number | null) => void;
}) {
  const rows = day.matches;
  const n = Math.max(1, rows.length);
  const plotW = W - PL - PR;
  const slotW = plotW / n;
  const cx = (i: number) => PL + slotW * i + slotW / 2;
  // Eje con cero real: los valores positivos van ARRIBA de la línea de 0 y los
  // negativos debajo (antes se usaba Math.abs y ±57 caían en el mismo punto).
  const TOP = compact ? 20 : 26;
  const BOTTOM = compact ? 136 : 172;
  const H = compact ? 156 : 190;

  const realPts: { x: number; v: number }[] = [];
  const planPts: { x: number; v: number }[] = [];
  let cumReal = 0;
  let cumPlan = 0;
  rows.forEach((r, i) => {
    const d = r.match.rrDelta ?? 0;
    cumReal += d; // real: todo lo jugado, incluidas las posteriores al corte
    if (!r.afterCut) cumPlan += d; // plan: hasta el corte (la del corte sí suma)
    realPts.push({ x: cx(i), v: cumReal });
    planPts.push({ x: cx(i), v: cumPlan });
  });
  if (rows.some((r) => r.afterCut)) {
    planPts.push({ x: cx(n - 1) + slotW / 2, v: cumPlan });
  }
  // Ancla en 0 al inicio para que la línea parta de la base.
  realPts.unshift({ x: PL, v: 0 });
  planPts.unshift({ x: PL, v: 0 });

  const values = [...realPts, ...planPts].map((p) => p.v);
  let min = Math.min(0, ...values);
  let max = Math.max(0, ...values);
  if (min === max) {
    min = -10;
    max = 10;
  }
  const pad = Math.max(4, (max - min) * 0.12);
  min -= pad;
  max += pad;
  const yOf = (v: number) => TOP + (BOTTOM - TOP) * (1 - (v - min) / (max - min));

  const step = niceStep(max - min);
  const ticks: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + 0.001; t += step) ticks.push(t);

  const path = (pts: { x: number; v: number }[]) => `M${pts.map((p) => `${p.x},${yOf(p.v)}`).join(' L')}`;
  const cutIdx = rows.findIndex((r) => r.cutPoint);
  const lastReal = realPts[realPts.length - 1];
  const lastPlan = planPts[planPts.length - 1];
  const sameEnd = lastReal && lastPlan && Math.abs(yOf(lastReal.v) - yOf(lastPlan.v)) < 0.5;

  return (
    <div className="audit-svg-scroll" style={{ marginTop: 8 }}>
      <svg style={{ width: '100%', minWidth: W }} viewBox={`0 0 ${W} ${H + 20}`} role="img" aria-label="RR acumulado real vs plan">
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={PL}
              y1={yOf(v)}
              x2={W - PR}
              y2={yOf(v)}
              stroke={v === 0 ? '#34495e' : '#20303f'}
              strokeWidth={v === 0 ? 1.2 : 1}
            />
            <text x={PL - 6} y={yOf(v) + 3} fontSize={compact ? 10 : 9} fill={v === 0 ? '#93a4b3' : '#5d7080'} textAnchor="end">
              {v > 0 ? `+${v}` : v}
            </text>
          </g>
        ))}
        {cutIdx >= 0 ? (
          <line x1={cx(cutIdx) + slotW / 2} y1={22} x2={cx(cutIdx) + slotW / 2} y2={H + 8} stroke="#e8c97a" strokeWidth="1.2" strokeDasharray="5 4" />
        ) : null}
        {planPts.length > 1 ? (
          <path d={path(planPts)} fill="none" stroke="#e8c97a" strokeWidth="1.6" strokeDasharray="6 4" opacity="0.9" />
        ) : null}
        {realPts.length > 1 ? (
          <path d={path(realPts)} fill="none" stroke="#ece8e1" strokeWidth="2" />
        ) : null}
        {lastReal ? <circle cx={lastReal.x} cy={yOf(lastReal.v)} r="3.5" fill="#ece8e1" /> : null}
        {lastReal ? (
          <text x={lastReal.x + 6} y={yOf(lastReal.v) + 4} fontSize={compact ? 11 : 10} fontWeight="700" fill="#ece8e1">
            {day.realRR == null ? 'RR?' : `${day.realRR > 0 ? '+' : ''}${day.realRR} real`}
          </text>
        ) : null}
        {lastPlan && !sameEnd ? (
          <text x={lastPlan.x + 6} y={yOf(lastPlan.v) + 4} fontSize={compact ? 11 : 10} fontWeight="700" fill="#e8c97a">
            {day.planRR == null ? 'RR?' : `${day.planRR > 0 ? '+' : ''}${day.planRR} con regla`}
          </text>
        ) : null}
        {sel != null && sel < n ? (
          <line x1={cx(sel)} y1={TOP} x2={cx(sel)} y2={BOTTOM} stroke="#ece8e1" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
        ) : null}
        {/* Zonas táctiles por partida: tocar selecciona (reemplaza el tooltip). */}
        {rows.map((_, i) => (
          <rect
            key={`hit-${i}`}
            x={cx(i) - slotW / 2}
            y={0}
            width={slotW}
            height={H + 20}
            fill="transparent"
            style={{ cursor: 'pointer' }}
            onClick={() => onPick(sel === i ? null : i)}
          />
        ))}
      </svg>
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
      <button className="audit-note-btn has" onClick={start} title={comment.text}>
        {comment.text.length > 40 ? `${comment.text.slice(0, 40)}…` : comment.text}
      </button>
    ) : (
      <button className="audit-note-btn" onClick={start}>+ nota</button>
    );
  }
  return (
    <div className="audit-note-edit">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Qué pasó / por qué este resultado…"
        rows={3}
        autoFocus
      />
      <div className="audit-note-actions">
        <button className="f-chip" onClick={save} disabled={saving}>
          {saving ? 'Guardando…' : text.trim() ? 'Guardar' : 'Borrar nota'}
        </button>
        <button className="f-chip" onClick={() => setEditing(false)} disabled={saving}>Cancelar</button>
      </div>
    </div>
  );
}