import { lossTag, lossTagTitle } from '@/lib/unwinnable';
import type { MatchRow } from '@/lib/types';

const ICON = { unwinnable: '☠', mine: '⚠' } as const;
const LABEL = { unwinnable: 'Injugable', mine: 'Mi culpa' } as const;

/** Icono automático de derrotas: ☠ injugable (cargada por el equipo), ⚠ mi culpa. */
export function LossBadge({ m }: { m: MatchRow }) {
  const tag = lossTag(m);
  if (!tag) return null;
  return (
    <span
      className={`res-badge ${tag === 'unwinnable' ? 'unw' : 'mine'}`}
      title={lossTagTitle(m, tag)}
      aria-label={LABEL[tag]}
      role="img"
    >
      {ICON[tag]}
    </span>
  );
}
