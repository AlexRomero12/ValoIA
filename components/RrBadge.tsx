import { rrChips } from '@/lib/rrDetail';
import type { MatchRow } from '@/lib/types';

/**
 * Chips del desglose de RR (mmr-history v2 desde v4.10): bono de rendimiento,
 * RR devuelto, penalización, escudo de protección...
 *
 * En las filas del historial (`mode="row"`) solo se pintan los avisos que
 * ocurren de vez en cuando, para no llenar la tabla de ruido; el resto
 * (movimiento, tier previo, colocación, cola) va en el tooltip y en el detalle.
 */
const NOTABLE = new Set(['bonus', 'refunded', 'forgiven', 'penalty', 'afk', 'shield', 'shieldup']);

export function RrBadge({ m, mode = 'row' }: { m: MatchRow; mode?: 'row' | 'full' }) {
  const all = rrChips(m.rrDetail);
  const chips = mode === 'row' ? all.filter((c) => NOTABLE.has(c.key)) : all;
  if (!chips.length) return null;
  const shown = mode === 'row' ? chips.slice(0, 2) : chips;
  const title = all.map((c) => c.title).join(' · ');
  return (
    <span className="rr-badges" title={title}>
      {shown.map((c) => (
        <span key={c.key} className={`rr-chip ${c.tone}`} title={c.title}>
          {c.label}
        </span>
      ))}
      {chips.length > shown.length ? (
        <span className="rr-chip neutral" title={title}>
          +{chips.length - shown.length}
        </span>
      ) : null}
    </span>
  );
}
