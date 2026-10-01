import type { MatchRow } from './types';
import type { Profile } from './profileTypes';
import { memberAccounts } from './profileTypes';
import { computeStats, type PlayerStats } from './stats';

/**
 * Análisis de stacks (client-side): con quién juega y cómo rinde según con
 * quién va. Un compañero es "conocido" cuando su `nombre#tag` coincide con la
 * cuenta principal o alternativa de algún perfil; los randoms nunca se listan.
 *
 * `bySize` cuenta partidas por número de compañeros conocidos (Solo = ninguno
 * conocido, aunque haya randoms). `byMate` es por compañero: una partida con
 * dos conocidos cuenta en los dos (la tabla es "WR contigo", no un reparto).
 */

export interface KnownProfile {
  id: string;
  label: string;
  color: string;
}

export interface StackGroup {
  key: string;
  label: string;
  color?: string;
  stats: PlayerStats;
  /** Muertes primeras por partida (promedio). */
  fdPerGame: number;
}

export interface StackAnalysis {
  bySize: StackGroup[];
  byMate: StackGroup[];
}

/** Índice `nombre#tag` (minúsculas) → perfil, para resolver compañeros. */
export function buildRegistry(profiles: Profile[]): Map<string, KnownProfile> {
  const reg = new Map<string, KnownProfile>();
  profiles.forEach((p, i) => {
    const info: KnownProfile = {
      id: p.id,
      label: p.label,
      color: p.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
    };
    for (const a of memberAccounts(p)) {
      reg.set(`${a.name}#${a.tag}`.toLowerCase(), info);
    }
  });
  return reg;
}

const DEFAULT_COLORS = ['#ff4655', '#35b6ff', '#e8c97a', '#2fd08a', '#b98cff', '#ff8f5c', '#5ce1e6', '#f45b9b'];

/** Perfiles conocidos presentes en la lista de compañeros (sin duplicados). */
export function knownMatesOf(m: MatchRow, reg: Map<string, KnownProfile>): KnownProfile[] {
  const out: KnownProfile[] = [];
  const seen = new Set<string>();
  for (const key of m.mates ?? []) {
    const info = reg.get(key);
    if (info && !seen.has(info.id)) {
      seen.add(info.id);
      out.push(info);
    }
  }
  return out;
}

const SIZE_LABELS: Record<number, string> = {
  1: 'Solo (o con randoms)',
  2: 'Dúo',
  3: 'Trío',
  4: '4-stack',
  5: 'Full stack',
};

function group(list: MatchRow[], key: string, label: string, color?: string): StackGroup {
  const stats = computeStats(list);
  return { key, label, color, stats, fdPerGame: stats.fd ?? 0 };
}

export function stackAnalysis(matches: MatchRow[], reg: Map<string, KnownProfile>): StackAnalysis {
  const sizeBuckets = new Map<number, MatchRow[]>();
  const mateBuckets = new Map<string, { info: KnownProfile; list: MatchRow[] }>();

  for (const m of matches) {
    if (!Array.isArray(m.mates)) continue;
    const known = knownMatesOf(m, reg);
    const size = known.length + 1;
    const list = sizeBuckets.get(size);
    if (list) list.push(m);
    else sizeBuckets.set(size, [m]);
    for (const info of known) {
      const bucket = mateBuckets.get(info.id);
      if (bucket) bucket.list.push(m);
      else mateBuckets.set(info.id, { info, list: [m] });
    }
  }

  const bySize = [...sizeBuckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([size, list]) => group(list, `size-${size}`, SIZE_LABELS[size] ?? `${size} jugadores`));

  const byMate = [...mateBuckets.values()]
    .sort((a, b) => b.list.length - a.list.length)
    .map(({ info, list }) => group(list, info.id, info.label, info.color));

  return { bySize, byMate };
}
