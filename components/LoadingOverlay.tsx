'use client';

import { useEffect, useState } from 'react';

interface LoadingOverlayProps {
  open: boolean;
  title?: string;
  message?: string;
  /** Progreso determinado (p. ej. perfil 3/6 confirmado). Sin él, barra animada. */
  progress?: { done: number; total: number } | null;
  /** true = bloquea la pantalla (cargas iniciales); false = panel flotante. */
  blocking?: boolean;
  hint?: string;
}

function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`;
}

/**
 * Loader visible para cargas grandes: spinner, paso actual, progreso y
 * cronómetro (para que nunca parezca que la app se quedó pegada).
 *
 * - `blocking`: overlay con fondo oscurecido (cargas iniciales, pantalla vacía).
 * - No bloqueante (default): tarjeta fija arriba que sigue visible al navegar.
 */
export function LoadingOverlay({ open, ...rest }: LoadingOverlayProps) {
  if (!open) return null;
  return <LoadingCard {...rest} />;
}

function LoadingCard({ title = 'Cargando', message, progress, blocking = false, hint }: Omit<LoadingOverlayProps, 'open'>) {
  const [startAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const elapsed = fmtElapsed(now - startAt);
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null;

  const card = (
    <div className={`loading-card${blocking ? ' blocking' : ''}`} role="status" aria-live="polite">
      <span className="loading-spinner" />
      <div className="loading-body">
        <b className="loading-title">{title}</b>
        {message ? <span className="loading-msg">{message}</span> : null}
        <div className="loading-progress">
          {pct != null ? (
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
          ) : (
            <div className="progress-track indeterminate">
              <div className="progress-fill" />
            </div>
          )}
          {progress ? (
            <span className="loading-count">
              {progress.done}/{progress.total}
            </span>
          ) : null}
        </div>
      </div>
      <span className="loading-time" title="Tiempo transcurrido">{elapsed}</span>
    </div>
  );

  if (blocking) {
    return <div className="loading-backdrop">{card}</div>;
  }
  return (
    <div className="loading-float">
      {card}
      {hint ? <span className="loading-hint">{hint}</span> : null}
    </div>
  );
}
