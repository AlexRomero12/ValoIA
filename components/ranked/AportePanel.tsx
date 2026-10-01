'use client';

import { useMemo } from 'react';
import { placementStats } from '@/lib/placement';
import { buildRegistry, stackAnalysis, type StackGroup } from '@/lib/stacks';
import { rrEconomy } from '@/lib/rrEconomy';
import { wrColor } from '@/lib/metas';
import type { MatchRow } from '@/lib/types';
import type { Profile } from '@/lib/profileTypes';

interface AportePanelProps {
  matches: MatchRow[];
  profiles: Profile[];
}

/** Pestaña Aporte: puesto en la tabla, stacks y economía de RR (todo client-side). */
export function AportePanel({ matches, profiles }: AportePanelProps) {
  const placement = useMemo(() => placementStats(matches), [matches]);
  const stacks = useMemo(() => stackAnalysis(matches, buildRegistry(profiles)), [matches, profiles]);
  const economy = useMemo(() => rrEconomy(matches), [matches]);

  const noDetail = placement.games === 0 && placement.lobbyGames === 0;

  return (
    <>
      <div className="panel">
        <h2>Aporte en la tabla</h2>
        <p className="wr-hint">
          De las últimas {matches.length} competitivas: tu puesto por ACS dentro de tu equipo y de los 10 del lobby.
          El promedio esperado en el lobby es 5.5.
        </p>

        {noDetail ? (
          <p className="empty">
            Estas partidas no traen el detalle del marcador completo, así que no se puede calcular el puesto. Pulsa
            Actualizar para recargarlas con el proveedor Henrik.
          </p>
        ) : (
          <>
            <div className="combat-grid three">
              <div className="combat-box">
                <div className="cb-title">Puesto medio</div>
                <div className="cb-duo">
                  <div className="cb-stat">
                    <span className="num">{placement.avgTeam != null ? placement.avgTeam.toFixed(1) : '—'}</span>
                    <span className="lbl">en tu equipo (/5)</span>
                  </div>
                  <div className="cb-stat">
                    <span className="num">{placement.avgLobby != null ? placement.avgLobby.toFixed(1) : '—'}</span>
                    <span className="lbl">en el lobby (/10)</span>
                  </div>
                </div>
                <div className="cb-note">
                  {placement.lobbyGames} partidas con marcador completo.
                </div>
              </div>

              <div className="combat-box">
                <div className="cb-title">Último de la tabla</div>
                <div className="aporte-rows">
                  <StatRow label="Último del equipo" value={`${placement.lastPct.toFixed(0)}%`} />
                  <StatRow label="Bottom-2" value={`${placement.bottom2Pct.toFixed(0)}%`} />
                  <StatRow
                    label="Bajo la media del equipo"
                    value={placement.belowAvgGames ? `${placement.belowAvgPct.toFixed(0)}%` : '—'}
                  />
                </div>
                <div className="cb-note">Cuanto más alto, más te están cargando.</div>
              </div>

              <div className="combat-box">
                <div className="cb-title">Dependencia</div>
                <div className="aporte-rows">
                  <StatRow
                    label="WR si eres último"
                    value={placement.wrWhenLast != null ? `${placement.wrWhenLast.toFixed(0)}%` : '—'}
                    color={placement.wrWhenLast != null ? wrColor(placement.wrWhenLast) : undefined}
                  />
                  <StatRow
                    label="WR si vas top-2"
                    value={placement.wrWhenTop2 != null ? `${placement.wrWhenTop2.toFixed(0)}%` : '—'}
                    color={placement.wrWhenTop2 != null ? wrColor(placement.wrWhenTop2) : undefined}
                  />
                </div>
                <div className="cb-note">
                  {placement.wrWhenLast != null && placement.wrWhenTop2 != null
                    ? placement.wrWhenLast > placement.wrWhenTop2
                      ? 'Ganas más cuando te cargan que cuando lideras: tu WR no mide tu aporte.'
                      : 'Ganas más cuando lideras el marcador: tu aporte sí mueve la aguja.'
                    : 'Sin datos suficientes en esta ventana.'}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="panel">
        <h2>Con quién juegas · por tamaño</h2>
        <p className="wr-hint">
          Partidas con 0..4 compañeros conocidos (segun los perfiles del dashboard). Solo = nadie de tus perfiles en tu
          equipo, aunque haya randoms.
        </p>
        {stacks.bySize.length ? (
          <div className="table-scroll">
            <table className="score-table stats-table">
              <thead>
                <tr>
                  <th>Stack</th>
                  <th className="num">Partidas</th>
                  <th className="num">Récord</th>
                  <th className="num">WR</th>
                  <th className="num">K/D</th>
                  <th className="num">ACS</th>
                  <th className="num">FD/p</th>
                </tr>
              </thead>
              <tbody>{stacks.bySize.map((g) => <StackRow key={g.key} g={g} />)}</tbody>
            </table>
          </div>
        ) : (
          <p className="empty">Sin partidas con lista de compañeros en esta ventana.</p>
        )}
      </div>

      <div className="panel">
        <h2>Con quién juegas · por compañero</h2>
        <p className="wr-hint">Una partida con dos conocidos cuenta en las dos filas. Solo compañeros de tus perfiles.</p>
        {stacks.byMate.length ? (
          <div className="table-scroll">
            <table className="score-table stats-table">
              <thead>
                <tr>
                  <th>Compañero</th>
                  <th className="num">Partidas</th>
                  <th className="num">Récord</th>
                  <th className="num">WR</th>
                  <th className="num">K/D</th>
                  <th className="num">ACS</th>
                  <th className="num">FD/p</th>
                </tr>
              </thead>
              <tbody>{stacks.byMate.map((g) => <StackRow key={g.key} g={g} />)}</tbody>
            </table>
          </div>
        ) : (
          <p className="empty">Ningún compañero de tus perfiles en esta ventana.</p>
        )}
      </div>

      <div className="panel">
        <h2>Economía de RR</h2>
        <p className="wr-hint">
          La API solo devuelve el RR de las ~20 partidas más recientes; el resto de la ventana no entra.
        </p>
        {economy ? (
          <>
            <div className="combat-grid">
              <div className="combat-box">
                <div className="cb-duo">
                  <div className="cb-stat win">
                    <span className="num">+{economy.avgWin.toFixed(0)}</span>
                    <span className="lbl">RR por victoria</span>
                  </div>
                  <div className="cb-vs">vs</div>
                  <div className="cb-stat loss">
                    <span className="num">{economy.avgLoss.toFixed(0)}</span>
                    <span className="lbl">RR por derrota</span>
                  </div>
                </div>
                <div className="cb-note">
                  Con esta economía necesitas un <b>{economy.breakEven.toFixed(0)}%</b> de WR para no bajar de rango.
                </div>
              </div>
              <div className="combat-box">
                <div className="cb-title">Ventana</div>
                <div className="aporte-rows">
                  <StatRow label="RR neto" value={`${economy.net > 0 ? '+' : ''}${economy.net}`} />
                  <StatRow label="Partidas con RR" value={String(economy.n)} />
                  <StatRow label="V-D con RR" value={`${economy.wins}-${economy.losses}`} />
                </div>
              </div>
            </div>
          </>
        ) : (
          <p className="empty">Sin suficientes partidas con dato de RR para estimar el equilibrio.</p>
        )}
      </div>
    </>
  );
}

function StackRow({ g }: { g: StackGroup }) {
  const { stats } = g;
  return (
    <tr>
      <td>
        {g.color ? (
          <span
            aria-hidden
            style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: g.color, marginRight: 6 }}
          />
        ) : null}
        {g.label}
      </td>
      <td className="num">{stats.games}</td>
      <td className="num">{stats.wins}–{stats.losses}</td>
      <td className="num" style={{ color: wrColor(stats.wr) }}>{stats.wr.toFixed(0)}%</td>
      <td className="num">{stats.kd.toFixed(2)}</td>
      <td className="num">{Math.round(stats.acs)}</td>
      <td className="num">{g.fdPerGame.toFixed(1)}</td>
    </tr>
  );
}

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="aporte-row">
      <span className="aporte-lbl">{label}</span>
      <b className="aporte-val" style={color ? { color } : undefined}>{value}</b>
    </div>
  );
}
