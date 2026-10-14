'use client';

import { useId } from 'react';
import { MAP_UNITS, type TimelineKill, type TimelineMoment, type TimelinePlayer, type TimelineView } from '@/lib/timelineView';

interface MiniMapProps {
  /** PNG del minimapa (1024×1024) tal cual lo publica valorant-api. */
  image: string | null;
  players: TimelinePlayer[];
  /** Momento que se está viendo: sus jugadores vivos y el marcador del evento. */
  moment: TimelineMoment | null;
  /** Todas las kills de la ronda, para dar contexto del recorrido. */
  kills: TimelineKill[];
  /** Equipo del perfil ("Blue"/"Red"), para destacar el bando propio. */
  myTeam: string | null;
}

const BLUE = '#35b6ff';
const RED = '#ff4655';
const GOLD = '#e8c97a';
/** Radio del retrato de agente, en milésimas del mapa. */
const ICON_R = 27;
/** Radio del retrato de la víctima: algo mayor que los vivos, para que se vea. */
const DEAD_R = ICON_R * 1.15;
const CONE_R = 118;
const CONE_SPREAD = 15;

/**
 * Plano de la ronda sobre el minimapa del mapa.
 *
 * El SVG trabaja en el mismo sistema que manda el servidor (milésimas de la
 * imagen, `viewBox="0 0 1000 1000"`), así que las posiciones se pintan tal
 * cual y el navegador se encarga de escalar: no hace falta saber el tamaño del
 * PNG ni recalcular nada al cambiar de tamaño.
 *
 * Cada jugador vivo va con su retrato de agente recortado en círculo (el mismo
 * `killfeedPortrait` que ya usa el feed, así que no es una descarga extra) y su
 * cono de visión. El bando propio va en azul, el rival en rojo y tú con el
 * aro dorado.
 */
export function MiniMap({ image, players, moment, kills, myTeam }: MiniMapProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const views = moment?.views ?? [];
  const victim = moment?.kind === 'kill' ? players[moment.kill?.v ?? -1] : undefined;

  return (
    <svg className="chrono-map" viewBox={`0 0 ${MAP_UNITS} ${MAP_UNITS}`} role="img"
      aria-label="Plano de la ronda con las posiciones de los jugadores">
      <defs>
        {views.map((v) => (
          <clipPath key={`clip-${v.p}`} id={`${uid}-clip-${v.p}`}>
            <circle cx={v.u} cy={v.v} r={ICON_R} />
          </clipPath>
        ))}
        {moment?.at ? (
          <clipPath id={`${uid}-clip-dead`}>
            <circle cx={moment.at.u} cy={moment.at.v} r={DEAD_R} />
          </clipPath>
        ) : null}
      </defs>

      <rect x={0} y={0} width={MAP_UNITS} height={MAP_UNITS} className="chrono-map-bg" />
      {image ? (
        <image href={image} x={0} y={0} width={MAP_UNITS} height={MAP_UNITS} preserveAspectRatio="xMidYMid meet" />
      ) : null}

      {/* Recorrido de la ronda: todas las kills, tenues, para dar contexto */}
      {kills.map((k, i) =>
        k.at ? <circle key={`c${i}`} cx={k.at.u} cy={k.at.v} r={8} className="chrono-dot-ghost" /> : null,
      )}

      {/* Conos de visión, por debajo de los retratos */}
      {views.map((v) => (
        <path key={`cone-${v.p}`} d={conePath(v)} fill={colorOf(players[v.p], myTeam)} className="chrono-cone" />
      ))}

      {/* El evento que se está viendo. En una kill el marcador ES el retrato
          apagado de la víctima: así no se tapan dos marcas en el mismo punto. */}
      {moment?.at ? (
        moment.kind === 'kill' ? (
          <g>
            <circle cx={moment.at.u} cy={moment.at.v} r={DEAD_R + 3} className="chrono-halo" />
            {victim?.agentIcon ? (
              <image
                href={victim.agentIcon}
                x={moment.at.u - DEAD_R}
                y={moment.at.v - DEAD_R}
                width={DEAD_R * 2}
                height={DEAD_R * 2}
                clipPath={`url(#${uid}-clip-dead)`}
                className="chrono-dead"
                preserveAspectRatio="xMidYMid slice"
              />
            ) : (
              <circle cx={moment.at.u} cy={moment.at.v} r={DEAD_R} fill="rgba(10, 15, 22, 0.75)" />
            )}
            <circle cx={moment.at.u} cy={moment.at.v} r={DEAD_R} fill="none" stroke={GOLD} strokeWidth={5} />
            <path
              d={`M ${moment.at.u - 15} ${moment.at.v - 15} L ${moment.at.u + 15} ${moment.at.v + 15}
                  M ${moment.at.u + 15} ${moment.at.v - 15} L ${moment.at.u - 15} ${moment.at.v + 15}`}
              stroke={RED}
              strokeWidth={6}
              strokeLinecap="round"
              className="chrono-dead-x"
            />
          </g>
        ) : (
          <EventMarker moment={moment} />
        )
      ) : null}

      {/* Retratos de los vivos, con su aro de equipo */}
      {views.map((v) => {
        const p = players[v.p];
        const col = colorOf(p, myTeam);
        return (
          <g key={`pin-${v.p}`}>
            {/* Halo oscuro: separa los retratos cuando el equipo va apiñado */}
            <circle cx={v.u} cy={v.v} r={ICON_R + 2} className="chrono-halo" />
            {p?.agentIcon ? (
              <image
                href={p.agentIcon}
                x={v.u - ICON_R}
                y={v.v - ICON_R}
                width={ICON_R * 2}
                height={ICON_R * 2}
                clipPath={`url(#${uid}-clip-${v.p})`}
                preserveAspectRatio="xMidYMid slice"
              />
            ) : (
              <circle cx={v.u} cy={v.v} r={ICON_R} fill={col} />
            )}
            <circle cx={v.u} cy={v.v} r={ICON_R} fill="none" stroke={col} strokeWidth={4.5} />
            {p?.isMe ? <circle cx={v.u} cy={v.v} r={ICON_R + 7} fill="none" stroke={GOLD} strokeWidth={3.5} /> : null}
            <title>{`${p?.name ?? '?'} · ${p?.agent ?? '?'}`}</title>
          </g>
        );
      })}
    </svg>
  );
}

/** Planta o defuse: recuadro con el sitio (A/B) o el símbolo de defuse. */
function EventMarker({ moment }: { moment: TimelineMoment }) {
  const { u, v } = moment.at!;
  const isPlant = moment.kind === 'plant';
  const col = isPlant ? '#ff5cf0' : '#5cf0ff';
  return (
    <g>
      <rect x={u - 21} y={v - 21} width={42} height={42} fill="rgba(10,15,22,0.6)" stroke={col} strokeWidth={5} />
      <text x={u} y={v + 11} textAnchor="middle" className="chrono-map-label" fill={col}>
        {isPlant ? (moment.site ?? 'A') : '✂'}
      </text>
    </g>
  );
}

/** Cono de visión: un triángulo desde el jugador hacia donde apuntaba. */
function conePath(v: TimelineView, radius = CONE_R, spread = CONE_SPREAD): string {
  const a1 = ((v.deg - spread) * Math.PI) / 180;
  const a2 = ((v.deg + spread) * Math.PI) / 180;
  return [
    `M ${v.u} ${v.v}`,
    `L ${(v.u + radius * Math.cos(a1)).toFixed(1)} ${(v.v + radius * Math.sin(a1)).toFixed(1)}`,
    `L ${(v.u + radius * Math.cos(a2)).toFixed(1)} ${(v.v + radius * Math.sin(a2)).toFixed(1)}`,
    'Z',
  ].join(' ');
}

function colorOf(p: TimelinePlayer | undefined, myTeam: string | null): string {
  if (!p) return '#8fa3b5';
  if (p.isMe) return GOLD;
  // El bando propio se pinta con el azul de la casa y el rival en rojo; los
  // equipos de la API son "Blue"/"Red", pero cuál es el tuyo cambia por partida.
  const isMine = myTeam != null && p.team === myTeam;
  return isMine ? BLUE : RED;
}
