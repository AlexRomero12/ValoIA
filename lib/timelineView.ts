import type { MapCalibration } from './valorant';

/**
 * Tipos y utilidades PURAS de la cronología, compartidos por servidor y cliente.
 *
 * Este módulo no importa nada con efectos (nada de `fs`, caché ni red): es lo
 * que pueden usar los componentes de cliente. La construcción del DTO vive en
 * `lib/timeline.ts`, que sí es de servidor.
 */

/** Resolución de las posiciones: milésimas de la imagen del minimapa. */
export const MAP_UNITS = 1000;

export type WeaponKind = 'weapon' | 'ability' | 'spike' | 'fall' | 'melee' | 'other';

export interface TimelineWeapon {
  name: string;
  icon: string | null;
  kind: WeaponKind;
  /** Disparo secundario (p. ej. la ráfaga del Classic). */
  secondary: boolean;
  /**
   * El feed no traía el arma y se dedujo de lo que el asesino compró esa ronda.
   * No es una invención: es el arma que tenía, pero puede fallar si la recogió
   * del suelo a mitad de ronda.
   */
  inferred?: boolean;
}

export interface TimelinePoint {
  u: number;
  v: number;
}

export interface TimelineView extends TimelinePoint {
  /** Índice del jugador en `MatchTimeline.players`. */
  p: number;
  /** Ángulo de visión en grados de pantalla (0° = derecha, sentido horario). */
  deg: number;
}

export interface TimelineKill {
  /** ms desde el inicio de la ronda. */
  t: number;
  /** Índice del asesino en `players`. */
  k: number;
  /** Índice de la víctima en `players`. */
  v: number;
  /** Índices de los asistentes. */
  a: number[];
  w: TimelineWeapon;
  /** Dónde cae la víctima (null si la kill no trae posición). */
  at: TimelinePoint | null;
  /** Jugadores VIVOS en ese instante, con posición y hacia dónde miraban. */
  views: TimelineView[];
  /** Primera kill de la ronda (la apertura). */
  first?: boolean;
}

export interface TimelineEco {
  /** Índice del jugador en `players`. */
  p: number;
  weapon: string | null;
  icon: string | null;
  armor: string | null;
  /** Valor del loadout esa ronda. */
  loadout: number;
  /** Créditos que le quedaron. */
  left: number;
}

/** Planta o defuse, con la foto de los jugadores vivos en ese instante. */
export interface TimelineRoundEvent extends TimelinePoint {
  /** Índice del jugador que plantó/defusó. */
  by: number;
  /** ms desde el inicio de la ronda. */
  t: number;
  views: TimelineView[];
  /** Solo en la planta: sitio A/B. */
  site?: string;
}

export interface TimelineRound {
  /** Número de ronda, 1-based (como en el timeline del detalle). */
  n: number;
  won: boolean;
  /** Bando: 'atk' | 'def' | null si no se puede inferir. */
  side: 'atk' | 'def' | null;
  result: string;
  plant: TimelineRoundEvent | null;
  defuse: TimelineRoundEvent | null;
  kills: TimelineKill[];
  /** Qué compró cada jugador esa ronda (vacío si la ronda no trae stats). */
  eco: TimelineEco[];
}

export interface TimelinePlayer {
  name: string;
  tag: string;
  team: string | null;
  isMe: boolean;
  agent: string;
  agentIcon: string | null;
}

export interface MatchTimeline {
  matchId: string;
  map: {
    name: string;
    /** PNG del minimapa (1024×1024); null si el mapa no tiene imagen. */
    image: string | null;
    /** null = mapa sin sistema de coordenadas (TDM): no se puede dibujar. */
    calibration: MapCalibration | null;
  };
  players: TimelinePlayer[];
  rounds: TimelineRound[];
  /** Avisos de datos incompletos, para que la UI no dé por bueno lo que falta. */
  notes: string[];
}

/**
 * Momentos de una ronda en orden temporal: las kills y la planta/defuse.
 *
 * Es lo que recorre el scrubber. Cada momento trae la foto de los jugadores
 * vivos en ese instante, que es lo que se pinta en el plano.
 */
export interface TimelineMoment {
  kind: 'kill' | 'plant' | 'defuse';
  t: number;
  at: TimelinePoint | null;
  views: TimelineView[];
  /** Presente solo cuando `kind === 'kill'`. */
  kill?: TimelineKill;
  /** Índice del jugador que plantó/defusó (solo en plant/defuse). */
  by?: number;
  /** Sitio A/B (solo en la planta). */
  site?: string;
}

export function roundMoments(round: TimelineRound): TimelineMoment[] {
  const out: TimelineMoment[] = round.kills.map((kill) => ({
    kind: 'kill' as const,
    t: kill.t,
    at: kill.at,
    views: kill.views,
    kill,
  }));
  if (round.plant) {
    const { t, u, v, views, by, site } = round.plant;
    out.push({ kind: 'plant', t, at: { u, v }, views, by, site });
  }
  if (round.defuse) {
    const { t, u, v, views, by } = round.defuse;
    out.push({ kind: 'defuse', t, at: { u, v }, views, by });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** ms dentro de la ronda -> "1:24". */
export function roundClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
