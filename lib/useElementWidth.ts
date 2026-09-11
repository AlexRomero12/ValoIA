'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Mide el ancho real del contenedor con ResizeObserver para que los SVG
 * calculen su layout en píxeles reales (y no solo se escalen con CSS).
 * SSR/primer render: devuelve `fallback` hasta que el elemento se monta.
 */
export function useElementWidth<T extends HTMLElement = HTMLDivElement>(fallback = 940) {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, width: width > 0 ? width : fallback };
}
