import { operatorLabel } from '@/lib/opUsage';
import type { MatchRow } from '@/lib/types';

/**
 * Marca de Operator: la comprada o la Tour De Force de la ult de Chamber.
 *
 * Existe porque el HS% de una partida con Operator no es comparable al de una
 * limpia: sus bodyshots matan igual que un headshot. El badge avisa de eso y el
 * tooltip dice cuántas rondas y kills fueron con ella.
 */
export function OpBadge({ m }: { m: MatchRow }) {
  const rounds = m.opRounds ?? 0;
  const kills = m.opKills ?? 0;
  if (rounds <= 0 && kills <= 0) return null;
  const title = `Operator: ${operatorLabel({ rounds, kills, ultKills: m.opUltKills ?? 0 })}. Sus bodyshots matan igual que un headshot, así que el HS% de esta partida está diluido.`;
  return (
    <span className="res-badge op" title={title} aria-label="Operator" role="img">
      OP
    </span>
  );
}
