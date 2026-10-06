interface MetaDef {
  key: string;
  label: string;
  target: number;
  fmt: (v: number) => string;
  get: (k: Kpis) => number | undefined;
  /** true = menor es mejor (p. ej. primeras muertes). */
  lowerIsBetter?: boolean;
  /** Texto del target para el pie de la tarjeta (default: "meta ≥ X"). */
  targetHint?: string;
  /** Explicación corta para la ayuda (?) de la tarjeta. */
  tip?: string;
}

export interface Kpis {
  matches: number;
  wins: number;
  losses: number;
  /** Empates (marcador igualado): no cuentan como victorias ni derrotas */
  draws?: number;
  wr: number;
  kd: number;
  acs: number;
  adr: number;
  hsPct: number;
  /** Primeras sangres por partida (promedio). Solo proveedor Henrik. */
  fb?: number;
  /** Primeras muertes por partida (promedio). Solo proveedor Henrik. */
  fd?: number;
}

export const METAS: MetaDef[] = [
  {
    key: 'wr',
    label: 'Winrate',
    target: 55,
    fmt: (v) => v.toFixed(1) + '%',
    get: (k) => k.wr,
    tip: 'Porcentaje de victorias en partidas decisivas: los empates no cuentan.',
  },
  { key: 'kd', label: 'K/D', target: 1.05, fmt: (v) => v.toFixed(2), get: (k) => k.kd, tip: 'Kills dividido por muertes.' },
  {
    key: 'acs',
    label: 'ACS',
    target: 220,
    fmt: (v) => Math.round(v).toString(),
    get: (k) => k.acs,
    tip: 'Puntos de combate por ronda: tu impacto promedio en cada ronda.',
  },
  {
    key: 'hs',
    label: 'HS%',
    target: 25,
    fmt: (v) => v.toFixed(1) + '%',
    get: (k) => k.hsPct,
    tip: 'Porcentaje de impactos en la cabeza. Ojo: las partidas con Operator lo diluyen (dispara al cuerpo).',
  },
  {
    label: 'ADR',
    key: 'adr',
    target: 150,
    fmt: (v) => Math.round(v).toString(),
    get: (k) => k.adr,
    tip: 'Daño por ronda.',
  },
  {
    key: 'fb',
    label: 'FB / partida',
    target: 2.5,
    fmt: (v) => v.toFixed(1),
    get: (k) => k.fb,
    targetHint: 'meta ≥ 2.5',
    tip: 'Primeras sangres por partida: rondas que abres con la primera kill.',
  },
  {
    key: 'fd',
    label: 'FD / partida',
    target: 2,
    fmt: (v) => v.toFixed(1),
    get: (k) => k.fd,
    lowerIsBetter: true,
    targetHint: 'meta ≤ 2.0',
    tip: 'Primeras muertes por partida: rondas donde caes primero. A la 3.ª, modo "no regalar".',
  },
];

/** Meta de winrate: el color pivota aquí para no contradecir los KPIs. */
const WR_META = 55;
const WR_CEIL = 70;

/**
 * Color del winrate en una escala continua anclada a la meta: por debajo va
 * de rojo a ámbar (nunca verde) y por encima de ámbar a verde. Antes el 46%
 * salía verde en los paneles mientras el KPI lo pintaba rojo.
 */
export function wrColor(wr: number): string {
  const v = Math.min(Math.max(wr, 0), WR_CEIL);
  const hue = v < WR_META ? (v / WR_META) * 45 : 45 + ((v - WR_META) / (WR_CEIL - WR_META)) * 85;
  return `hsl(${Math.round(hue)} 58% 52%)`;
}

/**
 * Clase de color para un delta (RR, saldo): verde si sube, rojo si baja y
 * neutro si es 0 o falta el dato. Sin esto, un `null` se pintaba verde y un
 * 0 se pintaba rojo — ambos casos mienten sobre lo que pasó.
 */
export function deltaClass(v: number | null | undefined): string {
  if (v == null || v === 0) return '';
  return v > 0 ? 'stat-win' : 'stat-loss';
}

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}
