'use client';

import { useMemo, useState } from 'react';
import { MatchDetailModal } from '@/components/MatchDetailModal';
import { esc, wrColor } from '@/lib/metas';
import type { AperturaBucket, AperturaGrupo, MatchRow, ValAperturas } from '@/lib/types';

/** Un agente necesita muestra suficiente para comparar (rondas, no partidas). */
const MIN_AGENT_ROUNDS = 30;
/** Debajo de esto la fila de mapa/agente se marca como muestra baja. */
const LOW_SAMPLE_ROUNDS = 40;
/** Señal para la lista de revisión: 2+ FB sin convertir o 3+ FD en la partida. */
const VOD_SIGNAL_FB_LOST = 2;
const VOD_SIGNAL_FD = 3;

interface AperturasPanelProps {
  aperturas?: ValAperturas;
  matches: MatchRow[];
  playerId?: string;
}

function pctOf(part: number, whole: number): number | null {
  return whole > 0 ? (part / whole) * 100 : null;
}

/** Cuántas rondas de cada 100 terminaron en ese escenario (normaliza volumen). */
function per100(count: number, rounds: number): string {
  return rounds > 0 ? ((count / rounds) * 100).toFixed(1) : '—';
}

/** Primeras muertes promedio por partida jugada en ese bando (denominador por lado). */
function perMatch(count: number, matches: number): string {
  return matches > 0 ? (count / matches).toFixed(1) : '—';
}

function Pct({ v, bold }: { v: number | null; bold?: boolean }) {
  if (v == null) return <span className="muted">—</span>;
  return <span style={{ color: wrColor(v), fontWeight: bold ? 700 : undefined }}>{v.toFixed(1)}%</span>;
}

function wrPct(won: number, n: number): string {
  return n > 0 ? `${Math.round((won / n) * 1000) / 10}%` : '—';
}

function bucketTitle(label: string, b: AperturaBucket): string {
  return `${label}: ${b.rounds} rondas · FD ${b.fd} (WR ${wrPct(b.fdWon, b.fd)}) · FB ${b.fb} (conv ${wrPct(b.fbWon, b.fb)})`;
}

export function AperturasPanel({ aperturas, matches, playerId }: AperturasPanelProps) {
  const [selected, setSelected] = useState<MatchRow | null>(null);
  const [showAll, setShowAll] = useState(false);

  const agentIcons = useMemo(() => new Map(matches.map((m) => [m.agent, m.agentIcon ?? null])), [matches]);
  const mapIcons = useMemo(() => new Map(matches.map((m) => [m.map, m.mapIcon ?? null])), [matches]);
  const matchesById = useMemo(() => new Map(matches.map((m) => [m.matchId, m])), [matches]);

  const vod = useMemo(() => {
    if (!aperturas) return [];
    return [...aperturas.matches].sort(
      // De la más reciente a la más vieja (fecha ISO: comparación lexicográfica directa).
      (a, b) => (a.date < b.date ? 1 : -1),
    );
  }, [aperturas]);
  const vodSignal = useMemo(
    () => vod.filter((p) => p.fbLost >= VOD_SIGNAL_FB_LOST || p.fd >= VOD_SIGNAL_FD),
    [vod],
  );
  const vodShown = showAll ? vod : vodSignal.length ? vodSignal : vod;

  if (!aperturas) {
    return (
      <div className="panel">
        <h2>Aperturas por ronda</h2>
        <p className="empty">
          Sin rondas con detalle en esta ventana. El FB/FD por ronda necesita partidas competitivas con kill feed
          (proveedor Henrik).
        </p>
      </div>
    );
  }

  const { total, atk, def, byMap, byAgent, sinLado } = aperturas;
  const agentRows = byAgent.filter((g) => g.total.rounds >= MIN_AGENT_ROUNDS);

  const bandos: { label: string; b: AperturaBucket }[] = [
    { label: 'Global', b: total },
    { label: 'ATK', b: atk },
    { label: 'DEF', b: def },
  ];

  return (
    <>
      <div className="panel">
        <h2>Aperturas por ronda · FB/FD</h2>
        <p className="wr-hint">
          FD = moriste primero en la ronda · FB = mataste primero. WR con FD = % de rondas que ganó tu equipo
          cuando moriste primero · WR sin FD = cuando no moriste primero · conversión = % de tus FB que terminaron
          en ronda ganada. En mapa/agente, FD/part. y FB/part. = primeras muertes / primeras sangres promedio por
          partida jugada en ese bando (ATK/DEF). Referencias del plan (ambos bandos): FD ≤ 2.0/partida ·
          FB ≥ 2.5/partida · conversión ≥ 70%.
        </p>
        <div className="table-scroll">
          <table className="score-table ap-table">
            <thead>
              <tr>
                <th>Bando</th>
                <th className="num">Rondas</th>
                <th className="num">FD/100r</th>
                <th className="num">WR con FD</th>
                <th className="num">WR sin FD</th>
                <th className="num">FB/100r</th>
                <th className="num">Conversión</th>
              </tr>
            </thead>
            <tbody>
              {bandos.map(({ label, b }) => (
                <tr key={label} title={bucketTitle(label, b)}>
                  <td>{label}</td>
                  <td className="num">{b.rounds}</td>
                  <td className="num">{per100(b.fd, b.rounds)}</td>
                  <td className="num"><Pct v={pctOf(b.fdWon, b.fd)} /></td>
                  <td className="num"><Pct v={pctOf(b.noFdWon, b.noFd)} /></td>
                  <td className="num">{per100(b.fb, b.rounds)}</td>
                  <td className="num"><Pct v={pctOf(b.fbWon, b.fb)} bold /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sinLado > 0 ? (
          <p className="window-info" style={{ marginTop: 6 }}>
            {sinLado} ronda(s) sin bando inferible (sin plantas que lo revelen): cuentan en Global y por
            grupo, no en ATK/DEF.
          </p>
        ) : null}
      </div>

      <div className="panel">
        <h2>Por mapa</h2>
        <p className="wr-hint">Ordenado por rondas jugadas. Marca ~ las muestras con menos de {LOW_SAMPLE_ROUNDS} rondas.</p>
        {!byMap.length ? (
          <p className="empty">Sin rondas con detalle en esta ventana.</p>
        ) : (
          <div className="table-scroll">
            <table className="score-table ap-table">
              <thead>
                <tr>
                  <th>Mapa</th>
                  <th className="num">Rondas</th>
                  <th className="num">FD/part. ATK</th>
                  <th className="num">FD/part. DEF</th>
                  <th className="num">WR con FD</th>
                  <th className="num">WR sin FD</th>
                  <th className="num">FB/part. ATK</th>
                  <th className="num">FB/part. DEF</th>
                  <th className="num">Conversión</th>
                </tr>
              </thead>
              <tbody>
                {byMap.map((g: AperturaGrupo) => (
                  <tr key={g.name} title={bucketTitle(g.name, g.total)}>
                    <td>
                      <span className="icon-cell">
                        {mapIcons.get(g.name) ? <img className="map-icon" src={mapIcons.get(g.name) ?? ''} alt="" loading="lazy" /> : null}
                        {esc(g.name)}
                        {g.total.rounds < LOW_SAMPLE_ROUNDS ? <span className="muted-tag">~ muestra baja</span> : null}
                      </span>
                    </td>
                    <td className="num">{g.total.rounds}</td>
                    <td className="num" title={`${g.atk.fd} FD en ${g.atkMatches} partida(s) de ataque`}>{perMatch(g.atk.fd, g.atkMatches)}</td>
                    <td className="num" title={`${g.def.fd} FD en ${g.defMatches} partida(s) de defensa`}>{perMatch(g.def.fd, g.defMatches)}</td>
                    <td className="num"><Pct v={pctOf(g.total.fdWon, g.total.fd)} /></td>
                    <td className="num"><Pct v={pctOf(g.total.noFdWon, g.total.noFd)} /></td>
                    <td className="num" title={`${g.atk.fb} FB en ${g.atkMatches} partida(s) de ataque`}>{perMatch(g.atk.fb, g.atkMatches)}</td>
                    <td className="num" title={`${g.def.fb} FB en ${g.defMatches} partida(s) de defensa`}>{perMatch(g.def.fb, g.defMatches)}</td>
                    <td className="num"><Pct v={pctOf(g.total.fbWon, g.total.fb)} bold /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Por agente</h2>
        <p className="wr-hint">Solo agentes con {MIN_AGENT_ROUNDS}+ rondas (el resto no es comparable).</p>
        {!agentRows.length ? (
          <p className="empty">Aún no hay rondas suficientes por agente en esta ventana.</p>
        ) : (
          <div className="table-scroll">
            <table className="score-table ap-table">
              <thead>
                <tr>
                  <th>Agente</th>
                  <th className="num">Rondas</th>
                  <th className="num">FD/part. ATK</th>
                  <th className="num">FD/part. DEF</th>
                  <th className="num">WR con FD</th>
                  <th className="num">WR sin FD</th>
                  <th className="num">FB/part. ATK</th>
                  <th className="num">FB/part. DEF</th>
                  <th className="num">Conversión</th>
                </tr>
              </thead>
              <tbody>
                {agentRows.map((g: AperturaGrupo) => (
                  <tr key={g.name} title={bucketTitle(g.name, g.total)}>
                    <td>
                      <span className="icon-cell">
                        {agentIcons.get(g.name) ? <img className="agent-icon" src={agentIcons.get(g.name) ?? ''} alt="" loading="lazy" /> : null}
                        {esc(g.name)}
                        {g.total.rounds < LOW_SAMPLE_ROUNDS ? <span className="muted-tag">~ muestra baja</span> : null}
                      </span>
                    </td>
                    <td className="num">{g.total.rounds}</td>
                    <td className="num" title={`${g.atk.fd} FD en ${g.atkMatches} partida(s) de ataque`}>{perMatch(g.atk.fd, g.atkMatches)}</td>
                    <td className="num" title={`${g.def.fd} FD en ${g.defMatches} partida(s) de defensa`}>{perMatch(g.def.fd, g.defMatches)}</td>
                    <td className="num"><Pct v={pctOf(g.total.fdWon, g.total.fd)} /></td>
                    <td className="num"><Pct v={pctOf(g.total.noFdWon, g.total.noFd)} /></td>
                    <td className="num" title={`${g.atk.fb} FB en ${g.atkMatches} partida(s) de ataque`}>{perMatch(g.atk.fb, g.atkMatches)}</td>
                    <td className="num" title={`${g.def.fb} FB en ${g.defMatches} partida(s) de defensa`}>{perMatch(g.def.fb, g.defMatches)}</td>
                    <td className="num"><Pct v={pctOf(g.total.fbWon, g.total.fb)} bold /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Revisión de aperturas (VOD)</h2>
        <p className="wr-hint">
          De la partida más reciente a la más vieja. Por defecto solo se listan las de señal (2+ FB sin convertir o
          3+ FD); el botón muestra todas. Una FD no es error por sí sola (entrada planificada o con trade): revisa
          quién podía tradearte y si había info antes de peekear. Toca una fila para ver el timeline de rondas.
        </p>
        <div className="filter-bar" style={{ justifyContent: 'flex-start', marginBottom: 8 }}>
          <button className="f-chip" onClick={() => setShowAll((v) => !v)} disabled={!vod.length}>
            {showAll ? 'Ver solo señal' : `Ver todas (${vod.length})`}
          </button>
          <span className="window-info">
            {vodSignal.length} partida(s) con 2+ FB sin convertir o 3+ FD
          </span>
        </div>
        {!vodShown.length ? (
          <p className="empty">Sin partidas para revisar en esta ventana.</p>
        ) : (
          <div className="table-scroll">
            <table className="score-table ap-table ap-vod">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Partida</th>
                  <th className="num">Res.</th>
                  <th className="num">Rondas</th>
                  <th className="num">FB sin conv.</th>
                  <th className="num">FD</th>
                </tr>
              </thead>
              <tbody>
                {vodShown.map((p) => {
                  const row = matchesById.get(p.matchId);
                  const draw = row ? row.roundsWon === row.roundsLost : false;
                  const res = draw ? 'E' : p.won ? 'V' : 'D';
                  return (
                    <tr
                      key={p.matchId}
                      className="clickable-row"
                      title="Ver timeline de rondas"
                      onClick={() => row && setSelected(row)}
                    >
                      <td className="muted-cell">
                        {new Date(p.date).toLocaleDateString('es', { day: '2-digit', month: 'short' })}
                      </td>
                      <td>
                        <span className="icon-cell">
                          {row?.mapIcon ? <img className="map-icon" src={row.mapIcon} alt="" loading="lazy" /> : null}
                          {row?.agentIcon ? <img className="agent-icon" src={row.agentIcon} alt="" loading="lazy" /> : null}
                          {esc(p.map)} · {esc(p.agent)}
                        </span>
                      </td>
                      <td className="num">
                        <span className={`res-badge ${res === 'V' ? 'w' : res === 'D' ? 'l' : 'e'}`}>{res}</span>
                      </td>
                      <td className="num">{p.rounds}</td>
                      <td className={`num${p.fbLost >= VOD_SIGNAL_FB_LOST ? ' ap-bad' : ''}`}>{p.fbLost}</td>
                      <td className={`num${p.fd >= VOD_SIGNAL_FD ? ' ap-bad' : ''}`}>{p.fd}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected ? <MatchDetailModal match={selected} playerId={playerId} onClose={() => setSelected(null)} /> : null}
    </>
  );
}
