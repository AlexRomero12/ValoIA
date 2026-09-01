'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';

export interface PreviewSkin {
  id: string;
  name: string;
  icon: string;
  weapon: string;
}

interface ChromaInfo {
  id: string;
  name: string;
  icon: string;
  label: string;
}

/**
 * Lightbox de previsualización: render grande de la skin, sus variantes de
 * color (chromas) si tiene, y toggle de favorita. Se renderiza con portal al
 * body (los .panel tienen clip-path y recortarían un modal fixed).
 */
export function SkinPreview({
  skin,
  favoriteIds,
  onToggle,
  onClose,
}: {
  skin: PreviewSkin | null;
  favoriteIds?: Set<string>;
  onToggle?: (offerId: string) => void;
  onClose: () => void;
}) {
  const [variant, setVariant] = useState<ChromaInfo | null>(null);

  const chromasQ = useQuery<ChromaInfo[]>({
    queryKey: ['store-chromas', skin?.id],
    queryFn: async () => {
      const res = await fetch(`/api/store/chromas?id=${encodeURIComponent(skin!.id)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('No se pudieron cargar las variantes');
      const json = (await res.json()) as { chromas?: ChromaInfo[] };
      return json.chromas ?? [];
    },
    enabled: !!skin?.id,
    staleTime: 60 * 60 * 1000,
  });

  // Al cambiar de skin el padre remonta este componente (key=skin.id):
  // `variant` vuelve a null sin necesidad de effects.

  useEffect(() => {
    if (!skin) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [skin, onClose]);

  if (!skin || typeof document === 'undefined') return null;

  const variants = chromasQ.data ?? [];
  const shown = variant ?? { id: skin.id, name: skin.name, icon: skin.icon };
  const isFav = favoriteIds?.has(skin.id) ?? false;

  return createPortal(
    <div className="skin-preview-overlay" onClick={onClose}>
      <div className="skin-preview" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          Cerrar
        </button>
        <div className="skin-preview-img">
          {shown.icon ? <img src={shown.icon} alt={shown.name} /> : null}
        </div>
        <div className="skin-preview-name">{skin.name}</div>
        <div className="skin-preview-weapon">{variant ? variant.label : skin.weapon || 'Skin'}</div>

        {variants.length > 1 ? (
          <div className="skin-preview-vars">
            {variants.map((c) => (
              <button
                key={c.id}
                className={`skin-preview-var${shown.id === c.id ? ' on' : ''}`}
                onClick={() => setVariant(c)}
                title={c.label}
              >
                {c.icon ? <img src={c.icon} alt="" loading="lazy" /> : null}
                <span>{c.label}</span>
              </button>
            ))}
          </div>
        ) : null}

        {onToggle ? (
          <button
            className={`star-btn${isFav ? ' on' : ''}`}
            onClick={() => onToggle(skin.id)}
            title={isFav ? 'Quitar de favoritas' : 'Marcar como favorita'}
          >
            {isFav ? '★' : '☆'} {isFav ? 'En favoritas' : 'Marcar favorita'}
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}