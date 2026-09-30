'use client';

import { useEffect } from 'react';

/**
 * Comportamiento común de un modal/lightbox: cierra con Escape y bloquea el
 * scroll del body mientras está montado. `active` permite usarlo en componentes
 * que sólo renderizan el modal cuando hay datos (evita la llamada condicional).
 */
export function useModalShell(onClose: () => void, active = true): void {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, active]);

  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}
