'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Ayuda breve junto a una métrica. El popover se monta en un portal con
 * position:fixed para que no lo recorten los clip-path de .kpi/.panel; se abre
 * al tocar/clic (funciona en táctil) y se cierra con Escape, scroll o fuera.
 */
export function InfoTip({ text, label = 'Más información' }: { text: string; label?: string }) {
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const close = () => setPos(null);

  useEffect(() => {
    if (!pos) return;
    const onDoc = (e: PointerEvent) => {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    // Cerrar en scroll/resize: la posición fija quedaría desfasada.
    document.addEventListener('pointerdown', onDoc);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onDoc);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [pos]);

  const open = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = r.top < 140;
    setPos({ x: r.left + r.width / 2, y: below ? r.bottom + 8 : r.top - 8, below });
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="infotip-btn"
        aria-label={label}
        aria-expanded={pos != null}
        onClick={() => (pos ? close() : open())}
      >
        ?
      </button>
      {pos && typeof document !== 'undefined'
        ? createPortal(
            <span
              className="infotip-pop"
              role="tooltip"
              style={{
                left: pos.x,
                top: pos.y,
                transform: pos.below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
              }}
            >
              {text}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}
