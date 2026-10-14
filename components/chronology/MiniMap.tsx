'use client';

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

/**
 * Plano de la ronda sobre el minimapa del mapa.
 *
 * El SVG trabaja en el mismo sistema que manda el servidor (milésimas de la
 * imagen, `viewBox="0 0 1000 1000"`), así que las posiciones se pintan tal
 * cual y el navegador se encarga de escalar: no hace falta saber el tamaño del
 * PNG ni recalcular nada al cambiar de tamaño.
 */
export function MiniMap({ image, players, moment, kills, myTeam }: MiniMapProps) {
  const views = moment?.views ?? [];
  return (
    <svg className="chrono-map" viewBox={`0 0 ${MAP_UNITS} ${MAP_UNITS}`} role="img"
      aria-label="Plano de la ronda con las posiciones de los jugadores">
      <rect x={0} y={0} width={MAP_UNITS} height={MAP_UNITS} className="chrono-map-bg" />
      {image ? (
        <image href={image} x={0} y={0} width={MAP_UNITS} height={MAP_UNITS} preserveAspectRatio="xMidYMid meet" />
      ) : null}

      {/* Recorrido de la ronda: todas las kills, tenues, para dar contexto */}
      {kills.map((k, i) =>
        k.at ? (
          <circle key={`c${i}`} cx={k.at.u} cy={k.at.v} r={9} className="chrono-dot-ghost" />
        ) : null,
      )}

      {/* Conos de visión: quién miraba a dónde en este instante */}
      {views.map((v) => {
        const col = colorOf(players[v.p], myTeam);
        return (
          <g key={`v${v.p}`}>
            <path d={conePath(v)} fill={col} className="chrono-cone" />
            <circle cx={v.u} cy={v.v} r={13} fill={col} className="chrono-pin" />
            {players[v.p]?.isMe ? (
              <circle cx={v.u} cy={v.v} r={20} fill="none" stroke={GOLD} strokeWidth={5} />
            ) : null}
          </g>
        );
      })}

      {/* Marcador del evento que se está viendo */}
      {moment?.at ? <Marker moment={moment} /> : null}
    </svg>
  );
}

function Marker({ moment }: { moment: TimelineMoment }) {
  const { u, v } = moment.at!;
  if (moment.kind === 'kill') {
    return (
      <g>
        <circle cx={u} cy={v} r={24} fill="none" stroke={GOLD} strokeWidth={5} />
        <path d={`M ${u - 13} ${v - 13} L ${u + 13} ${v + 13} M ${u + 13} ${v - 13} L ${u - 13} ${v + 13}`}
          stroke={GOLD} strokeWidth={5} strokeLinecap="round" />
      </g>
    );
  }
  const isPlant = moment.kind === 'plant';
  const col = isPlant ? '#ff5cf0' : '#5cf0ff';
  return (
    <g>
      <rect x={u - 20} y={v - 20} width={40} height={40} fill="none" stroke={col} strokeWidth={5} />
      <text x={u} y={v + 9} textAnchor="middle" className="chrono-map-label" fill={col}>
        {isPlant ? '◉' : '✂'}
      </text>
    </g>
  );
}

/** Cono de visión: un triángulo desde el jugador hacia donde apuntaba. */
function conePath(v: TimelineView, radius = 105, spread = 16): string {
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
