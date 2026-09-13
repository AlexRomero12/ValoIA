'use client';

import { useEffect, useState } from 'react';

/**
 * Mide el ancho real del contenedor con ResizeObserver para que los SVG
 * calculen su layout en píxeles reales (y no solo se escalen con CSS).
 *
 * Callback ref: el observer se re-engancha cada vez que el elemento se monta,
 * clave en paneles condicionales (p. ej. el cuerpo de un día de Reglas, que
 * solo existe al expandir). SSR/primer render: devuelve `fallback`.
 */
export function useElementWidth<T extends HTMLElement = HTMLDivElement>(fallback = 940) {
  const [node, setNode] = useState<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!node) return;
    const update = () => setWidth(node.clientWidth);
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);

  return { ref: setNode, width: width > 0 ? width : fallback };
}
