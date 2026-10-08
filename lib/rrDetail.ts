import type { RrChangeDetail } from './types';

/**
 * Desglose del cambio de RR de una partida competitiva.
 *
 * La API v4.10 añadió al mmr-history v2 (y al stored-mmr v2) el detalle que
 * Riot manda tras cada partida: RR previo, bono de rendimiento, penalizaciones
 * y movimiento competitivo. Los registros anteriores a ese cambio llegan con
 * esos campos a `null`, así que `detailed` distingue "no hay detalle" de
 * "detalle con valores a cero" (que sí es información: no hubo bono).
 *
 * Módulo puro (sin red ni disco): lo consume el resumen y la UI. La entrada es
 * deliberadamente laxa (`RrDetailInput`) porque el mismo desglose se calcula
 * tanto de la respuesta viva de la API como del snapshot persistido.
 */

export interface RrDetailInput {
  rr?: number | null;
  last_change?: number | null;
  rr_before_update?: number | null;
  rr_performance_bonus?: number | null;
  rr_penalty?: number | null;
  afk_penalty?: number | null;
  refunded_rr?: number | null;
  new_map_incentive_rr_forgiven?: number | null;
  is_placement_match?: boolean | null;
  was_derank_protected?: boolean | null;
  was_derank_protection_replenished?: boolean | null;
  competitive_movement?: string | null;
  queue_id?: string | null;
  tier_before_update?: { id?: number; name?: string } | null;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** MOVEMENT_UP / MOVEMENT_DOWN / MOVEMENT_NONE / MOVEMENT_UNKNOWN. */
export function movementOf(raw: string | null | undefined): RrChangeDetail['movement'] {
  if (!raw) return null;
  const s = raw.toUpperCase();
  if (s.includes('UNKNOWN')) return null;
  if (s.includes('UP')) return 'up';
  if (s.includes('DOWN')) return 'down';
  if (s.includes('NONE') || s.includes('NEUTRAL') || s.includes('SAME')) return 'none';
  return null;
}

/** true si la entrada trae el detalle nuevo de v4.10 (aunque venga a cero). */
export function hasRrDetail(e: RrDetailInput | null | undefined): boolean {
  if (!e) return false;
  return (
    e.rr_before_update != null ||
    e.rr_performance_bonus != null ||
    e.rr_penalty != null ||
    e.afk_penalty != null ||
    e.is_placement_match != null ||
    e.queue_id != null ||
    e.competitive_movement != null
  );
}

export function rrChangeDetail(e: RrDetailInput | null | undefined): RrChangeDetail | null {
  if (!e) return null;
  const rrAfter = numOrNull(e.rr);
  const rrBefore = numOrNull(e.rr_before_update);
  const delta = numOrNull(e.last_change) ?? (rrAfter != null && rrBefore != null ? rrAfter - rrBefore : null);
  return {
    rrBefore,
    rrAfter,
    delta,
    bonus: num(e.rr_performance_bonus),
    penalty: num(e.rr_penalty),
    afkPenalty: num(e.afk_penalty),
    refunded: num(e.refunded_rr),
    forgiven: num(e.new_map_incentive_rr_forgiven),
    placement: e.is_placement_match === true,
    derankProtected: e.was_derank_protected === true,
    shieldReplenished: e.was_derank_protection_replenished === true,
    movement: movementOf(e.competitive_movement),
    queue: e.queue_id ?? null,
    tierBefore: e.tier_before_update?.name ?? null,
    detailed: hasRrDetail(e),
  };
}

export interface RrChip {
  key: string;
  label: string;
  tone: 'good' | 'bad' | 'neutral';
  title: string;
}

/**
 * Chips para pintar el desglose: solo lo que aporta información (valores a
 * cero y banderas falsas se omiten, para no ensuciar cada fila del historial).
 */
export function rrChips(d: RrChangeDetail | null | undefined): RrChip[] {
  if (!d) return [];
  const out: RrChip[] = [];
  if (d.bonus > 0) {
    out.push({
      key: 'bonus',
      label: `+${d.bonus} bono`,
      tone: 'good',
      title: 'RR extra por rendimiento (MVP o marcador alto)',
    });
  }
  if (d.refunded > 0) {
    out.push({
      key: 'refunded',
      label: `+${d.refunded} devuelto`,
      tone: 'good',
      title: 'RR devuelto por Riot (partida con tramposo o corrección posterior)',
    });
  }
  if (d.forgiven > 0) {
    out.push({
      key: 'forgiven',
      label: `+${d.forgiven} mapa nuevo`,
      tone: 'good',
      title: 'RR perdonado por el incentivo de mapa nuevo',
    });
  }
  if (d.penalty > 0) {
    out.push({
      key: 'penalty',
      label: `−${d.penalty} penalización`,
      tone: 'bad',
      title: 'Penalización de RR (dodge o abandono)',
    });
  }
  if (d.afkPenalty > 0) {
    out.push({ key: 'afk', label: `−${d.afkPenalty} AFK`, tone: 'bad', title: 'Penalización por AFK' });
  }
  if (d.derankProtected) {
    out.push({
      key: 'shield',
      label: 'escudo',
      tone: 'good',
      title: 'El escudo de protección de rango evitó el descenso',
    });
  }
  if (d.shieldReplenished) {
    out.push({ key: 'shieldup', label: 'escudo repuesto', tone: 'good', title: 'Se repuso un escudo de protección' });
  }
  if (d.placement) {
    out.push({ key: 'placement', label: 'colocación', tone: 'neutral', title: 'Partida de colocación' });
  }
  if (d.movement === 'up') {
    out.push({ key: 'up', label: 'movimiento ↑', tone: 'good', title: 'Riot marcó movimiento competitivo al alza' });
  } else if (d.movement === 'down') {
    out.push({ key: 'down', label: 'movimiento ↓', tone: 'bad', title: 'Riot marcó movimiento competitivo a la baja' });
  }
  if (d.tierBefore) {
    out.push({ key: 'tierbefore', label: `desde ${d.tierBefore}`, tone: 'neutral', title: 'Tier antes de esta partida' });
  }
  if (d.queue && d.queue.toLowerCase() !== 'competitive') {
    out.push({ key: 'queue', label: d.queue, tone: 'neutral', title: 'Cola de la partida' });
  }
  return out;
}

/** "73 → 90 (+17)"; null si no hay RR previo. */
export function rrTransitionText(d: RrChangeDetail | null | undefined): string | null {
  if (!d || d.rrBefore == null || d.rrAfter == null) return null;
  const delta = d.delta ?? d.rrAfter - d.rrBefore;
  const sign = delta > 0 ? '+' : '';
  return `${d.rrBefore} → ${d.rrAfter} (${sign}${delta})`;
}
