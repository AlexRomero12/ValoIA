'use client';

import { conferenceLabel, premierRoleLabel, premierSeasonPlayed } from '@/lib/premier';
import type { ValPremier, ValPremierSeason } from '@/lib/types';

interface PremierTabProps {
  premier: ValPremier | null;
  loading?: boolean;
  error?: string | null;
}

/**
 * Los colores de personalización de Premier llegan como hex crudo ("113c63",
 * a veces "0x113c63"): sin la almohadilla el navegador descarta el `background`
 * y el escudo quedaría transparente.
 */
function cssColor(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const hex = raw.trim().replace(/^0x/i, '').replace(/^#/, '');
  return /^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex) ? `#${hex}` : null;
}

/** Escudo sin imagen: bicolor si hay primario y secundario, si no un color liso. */
function crestBackground(primary: string | null, secondary: string | null): string | undefined {
  const a = cssColor(primary);
  const b = cssColor(secondary);
  if (a && b) return `linear-gradient(135deg, ${a} 0 50%, ${b} 50% 100%)`;
  return a ?? b ?? undefined;
}

/** Fecha corta es-ES; null si falta el dato o el ISO no es parseable. */
function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** El winrate de Premier llega como fracción (0.7 = 70%); sin partidas es null. */
function wrText(winRate: number | null): string {
  return winRate == null ? '—' : `${Math.round(winRate * 100)}%`;
}

/**
 * Premier publica la división como número, sin nombre oficial: se pinta el
 * número ("División 17") en vez de inventar etiquetas tipo "Elite".
 */
function divisionText(division: number | null): string {
  return division == null ? '—' : `División ${division}`;
}

/** Insignias de una temporada, en orden de importancia. */
function seasonChips(s: ValPremierSeason): string[] {
  const chips: (string | null)[] = [
    s.earnedPromotion ? 'Ascenso conseguido' : null,
    s.earnedPrestige ? 'Prestigio' : null,
    s.provisional ? 'Provisional' : null,
  ];
  return chips.filter((c): c is string => c != null);
}

export function PremierTab({ premier, loading, error }: PremierTabProps) {
  if (loading && !premier) return <p className="empty">Cargando Premier…</p>;
  if (error) return <p className="empty">{error}</p>;
  if (!premier) return <p className="empty">Esta cuenta no está en un equipo de Premier.</p>;

  const current = premier.current;
  // Sin inscripción, Premier devuelve stats a cero: no son resultados reales.
  const played = premierSeasonPlayed(current);
  // Las insignias son de la temporada en curso, no del equipo.
  const chips = current ? seasonChips(current) : [];
  const founded = shortDate(premier.createdAt);
  const members = premier.members.length;
  // Sin imagen de equipo el escudo es un cuadrado con sus colores: el CSS lo
  // centra con tipografía de display, así que lleva las iniciales dentro.
  const initials = (premier.tag.trim() || premier.name.trim() || '?').slice(0, 2).toUpperCase();

  return (
    <>
      <div className="panel premier-head">
        {premier.image ? (
          <img className="premier-crest" src={premier.image} alt="" loading="lazy" />
        ) : (
          <span
            className="premier-crest"
            aria-hidden
            style={{ background: crestBackground(premier.primary, premier.secondary) }}
          >
            {initials}
          </span>
        )}
        <p className="premier-meta">
          <b>
            {premier.name}
            {premier.tag ? <span className="acct-tag">#{premier.tag}</span> : null}
          </b>
          <span>
            {founded ? `Fundado el ${founded}` : 'Fecha de fundación sin dato'}
            {` · ${members} ${members === 1 ? 'miembro' : 'miembros'}`}
          </span>
        </p>
      </div>

      <div className="panel">
        <h2>Roster</h2>
        <div className="table-scroll">
          <table className="premier-roster">
            <thead>
              <tr>
                <th>Rol</th>
                <th>Jugador</th>
                <th>Desde</th>
              </tr>
            </thead>
            <tbody>
              {members === 0 ? (
                <tr>
                  <td colSpan={3}>
                    <p className="empty">El equipo no tiene miembros en el roster.</p>
                  </td>
                </tr>
              ) : (
                premier.members.map((m, i) => {
                  const joined = shortDate(m.joinedAt);
                  return (
                    <tr key={m.puuid || `m-${i}`}>
                      <td>{premierRoleLabel(m.role)}</td>
                      <td>
                        {/* Sin nombre resuelto no se inventa: se deja el hueco. */}
                        {m.name ? (
                          <>
                            {m.name}
                            {m.tag ? <span className="acct-tag">#{m.tag}</span> : null}
                          </>
                        ) : (
                          '—'
                        )}
                        {m.known ? <span className="res-badge mine">perfil</span> : null}
                      </td>
                      <td>{joined ?? '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h2>
          Temporada actual
          {chips.map((c) => (
            <span key={c} className="premier-chip">
              {c}
            </span>
          ))}
        </h2>
        {played && current ? (
          <div className="premier-stats">
            <div className="premier-stat">
              <span className="premier-stat-v">{current.matches}</span>
              <span className="premier-stat-k">Partidos</span>
            </div>
            <div className="premier-stat">
              <span className="premier-stat-v">{current.wins}-{current.losses}</span>
              <span className="premier-stat-k">V-D</span>
            </div>
            <div className="premier-stat">
              <span className="premier-stat-v">{wrText(current.winRate)}</span>
              <span className="premier-stat-k">WR</span>
            </div>
            <div className="premier-stat">
              <span className="premier-stat-v">{current.roundsWon}-{current.roundsLost}</span>
              <span className="premier-stat-k">Rondas</span>
            </div>
            <div className="premier-stat">
              <span className="premier-stat-v">{current.points}</span>
              <span className="premier-stat-k">Puntos</span>
            </div>
            <div className="premier-stat">
              <span className="premier-stat-v">{conferenceLabel(current.conference) ?? '—'}</span>
              <span className="premier-stat-k">Conferencia</span>
            </div>
            <div className="premier-stat">
              <span className="premier-stat-v">{divisionText(current.division)}</span>
              <span className="premier-stat-k">División</span>
            </div>
          </div>
        ) : (
          <p className="empty">El equipo no está inscrito en la temporada actual.</p>
        )}
      </div>

      {premier.seasons.length > 0 ? (
        <div className="panel">
          <h2>Temporadas</h2>
          <div className="table-scroll">
            <table className="premier-seasons">
              <thead>
                <tr>
                  <th>Temporada</th>
                  <th className="num">Partidos</th>
                  <th className="num">V-D</th>
                  <th className="num">WR</th>
                  <th className="num">Puntos</th>
                  <th>División</th>
                </tr>
              </thead>
              <tbody>
                {premier.seasons.map((s, i) => (
                  <tr key={s.id || `s-${i}`}>
                    <td>{s.name ?? `Temporada ${i + 1}`}</td>
                    <td className="num">{s.matches}</td>
                    <td className="num">{s.wins}-{s.losses}</td>
                    <td className="num">{wrText(s.winRate)}</td>
                    <td className="num">{s.points}</td>
                    <td>{divisionText(s.division)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}
