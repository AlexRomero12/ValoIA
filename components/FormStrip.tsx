import type { MatchRow } from '@/lib/types';
import { formOf } from '@/lib/form';

/** Forma reciente: últimas 5 competitivas como V/D/E y racha actual (el empate la corta). */
export function FormStrip({ matches }: { matches: MatchRow[] }) {
  const form = formOf(matches);
  if (!form.last.length) return null;
  const showStreak = form.streak && form.streak.count > 1;
  return (
    <div className="form-strip">
      <span className="form-label">Forma</span>
      <span className="form-dots">
        {form.last.map((r, i) => (
          <span key={i} className={`form-dot ${r === 'V' ? 'w' : r === 'D' ? 'l' : 'e'}`} title={r === 'V' ? 'Victoria' : r === 'D' ? 'Derrota' : 'Empate'}>
            {r}
          </span>
        ))}
      </span>
      {showStreak ? (
        <span className={`form-streak ${form.streak!.type}`}>
          {form.streak!.count}{form.streak!.type === 'win' ? 'V' : 'D'} seguidas
        </span>
      ) : null}
    </div>
  );
}
