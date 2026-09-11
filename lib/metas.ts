export interface MetaDef {
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

export const TIER_NAMES = ['Unrated','Unrated','Unrated','Iron 1','Iron 2','Iron 3','Bronze 1','Bronze 2','Bronze 3','Silver 1','Silver 2','Silver 3','Gold 1','Gold 2','Gold 3','Platinum 1','Platinum 2','Platinum 3','Diamond 1','Diamond 2','Diamond 3','Ascendant 1','Ascendant 2','Ascendant 3','Immortal 1','Immortal 2','Immortal 3','Radiant'];

export function tierName(t: number | null | undefined): string {
  if (t == null) return '—';
  return TIER_NAMES[t] ?? `Tier ${t}`;
}

export function wrColor(wr: number): string {
  const hue = Math.round((Math.min(Math.max(wr, 0), 70) / 70) * 130);
  return `hsl(${hue} 58% 52%)`;
}

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}
