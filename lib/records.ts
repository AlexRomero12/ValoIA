import type { HenrikAccolades, HenrikAccoladeKind, HenrikAccoladeMetric } from './henrik';
import type { RecordMetric, ValRecords } from './types';

/**
 * Récords de la cuenta a partir de los accolades de Riot (v4.10).
 *
 * Riot publica tres vistas del mismo dato:
 *  - `summary.all_time`: por tipo, cuántas veces lo conseguiste y tu mejor marca.
 *  - `summary.seasons`: lo mismo acotado a cada acto.
 *  - `matches`: por partida, el valor que hiciste y si fue récord del acto.
 *
 * Módulo puro: recibe la respuesta ya descargada y devuelve el DTO del dash.
 */

interface RecordMeta {
  label: string;
  unit: string;
  decimals: number;
}

const META: Record<string, RecordMeta> = {
  kills: { label: 'Más kills en una partida', unit: 'kills', decimals: 0 },
  first_blood: { label: 'Más primeras sangres en una partida', unit: 'FB', decimals: 0 },
  damage_per_round: { label: 'Mejor daño por ronda', unit: 'ADR', decimals: 1 },
  clutches: { label: 'Más clutches 1vX en una partida', unit: 'clutches', decimals: 0 },
  aces: { label: 'Aces en una partida', unit: 'aces', decimals: 0 },
  trades: { label: 'Más trades en una partida', unit: 'trades', decimals: 0 },
  headshot_percentage: { label: 'Mejor % de headshots', unit: '% HS', decimals: 1 },
  distinction: { label: 'Distinciones', unit: 'distinciones', decimals: 0 },
  assists: { label: 'Más asistencias en una partida', unit: 'asistencias', decimals: 0 },
  top_frag: { label: 'Más veces top frag', unit: 'veces', decimals: 0 },
  plants: { label: 'Más plantas en una partida', unit: 'plantas', decimals: 0 },
  mvp: { label: 'Mejor puntuación de MVP', unit: 'pts', decimals: 0 },
};

const KIND_ORDER: HenrikAccoladeKind[] = [
  'kills',
  'first_blood',
  'damage_per_round',
  'clutches',
  'aces',
  'trades',
  'headshot_percentage',
  'mvp',
  'top_frag',
  'assists',
  'plants',
  'distinction',
];

const FALLBACK_META: RecordMeta = { label: 'Récord', unit: '', decimals: 0 };

export function recordMeta(kind: string | null | undefined): RecordMeta {
  return META[kind ?? ''] ?? FALLBACK_META;
}

/** "192.7 ADR", "26 kills", "58.3 % HS"... */
export function formatRecordValue(kind: string | null | undefined, value: number): string {
  const meta = recordMeta(kind);
  const n = meta.decimals > 0 ? value.toFixed(meta.decimals) : String(Math.round(value));
  return meta.unit ? `${n} ${meta.unit}` : n;
}

/** Ordena los récords por el orden canónico del método (no por el de la API). */
function sortMetrics(metrics: RecordMetric[]): RecordMetric[] {
  return [...metrics].sort((a, b) => {
    const ia = KIND_ORDER.indexOf(a.kind as HenrikAccoladeKind);
    const ib = KIND_ORDER.indexOf(b.kind as HenrikAccoladeKind);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.label.localeCompare(b.label);
  });
}

function metricOf(m: HenrikAccoladeMetric): RecordMetric | null {
  const kind = m.type ?? '';
  if (!kind) return null;
  const best = typeof m.best_value === 'number' ? m.best_value : 0;
  const meta = recordMeta(kind);
  return {
    kind,
    label: meta.label,
    unit: meta.unit,
    count: typeof m.count === 'number' ? m.count : 0,
    best,
    bestText: formatRecordValue(kind, best),
  };
}

export function recordsFrom(
  acc: HenrikAccolades | null | undefined,
  puuid?: string | null,
): ValRecords | null {
  if (!acc || typeof acc !== 'object') return null;
  const owner = puuid ?? acc.account?.puuid ?? null;

  const allTime = sortMetrics(
    (acc.summary?.all_time ?? []).map(metricOf).filter((m): m is RecordMetric => m != null),
  );

  const seasons = acc.summary?.seasons ?? [];
  const lastSeason = seasons.length ? seasons[seasons.length - 1] : null;
  const seasonMetrics = sortMetrics(
    (lastSeason?.accolades ?? []).map(metricOf).filter((m): m is RecordMetric => m != null),
  );

  const recent: ValRecords['recent'] = [];
  const actRecords: ValRecords['actRecords'] = [];
  for (const m of acc.matches ?? []) {
    const matchId = m.match_id ?? '';
    const date = m.started_at ?? '';
    const mine = (m.players ?? []).find((p) => owner != null && p.puuid === owner);
    const items = (mine?.accolades ?? []).map((a) => {
      const kind = a.type ?? '';
      const value = typeof a.value === 'number' ? a.value : 0;
      const item = {
        label: recordMeta(kind).label,
        value,
        valueText: formatRecordValue(kind, value),
        actRecord: a.is_act_record === true,
      };
      if (item.actRecord && matchId) {
        actRecords.push({ label: item.label, value, valueText: item.valueText, matchId, date });
      }
      return item;
    });
    if (items.length) recent.push({ matchId, date, items });
  }

  if (!allTime.length && !seasonMetrics.length && !recent.length) return null;

  return {
    allTime,
    season: seasonMetrics.length ? { season: lastSeason?.season?.short ?? null, metrics: seasonMetrics } : null,
    recent,
    actRecords,
  };
}

export interface ImprovedRecord {
  kind: string;
  label: string;
  from: number;
  to: number;
  fromText: string;
  toText: string;
}

/**
 * Récords mejorados entre dos capturas (para avisar por push).
 *
 * Compara el mejor valor de cada tipo: solo devuelve lo que SUBE. Un tipo que
 * aparece por primera vez cuenta como mejora (from = 0), que es justo lo que
 * se quiere avisar la primera vez.
 */
export function improvedRecords(
  prev: HenrikAccolades | null | undefined,
  next: HenrikAccolades | null | undefined,
): ImprovedRecord[] {
  const nextMetrics = (next?.summary?.all_time ?? []).map(metricOf).filter((m): m is RecordMetric => m != null);
  if (!nextMetrics.length) return [];
  const prevBest = new Map<string, number>();
  for (const m of (prev?.summary?.all_time ?? []).map(metricOf)) {
    if (m) prevBest.set(m.kind, m.best);
  }
  const out: ImprovedRecord[] = [];
  for (const m of nextMetrics) {
    const before = prevBest.get(m.kind);
    if (before == null) {
      if (m.best > 0) {
        out.push({
          kind: m.kind,
          label: m.label,
          from: 0,
          to: m.best,
          fromText: formatRecordValue(m.kind, 0),
          toText: m.bestText,
        });
      }
      continue;
    }
    if (m.best > before) {
      out.push({
        kind: m.kind,
        label: m.label,
        from: before,
        to: m.best,
        fromText: formatRecordValue(m.kind, before),
        toText: m.bestText,
      });
    }
  }
  return out;
}

/** Texto corto para el push: "26 kills · 192.7 ADR". */
export function improvedRecordsText(list: ImprovedRecord[], max = 3): string {
  return list
    .slice(0, max)
    .map((r) => r.toText)
    .join(' · ');
}
