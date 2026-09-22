'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';

export interface PreviewItem {
  kind: 'card' | 'buddy' | 'spray' | 'title' | 'unknown';
  id: string;
  name: string;
  icon?: string;
  /** player card: banner completo */
  largeArt?: string;
  /** spray */
  fullIcon?: string;
  animationGif?: string | null;
  animationPng?: string | null;
  /** buddy */
  levels?: Array<{ id: string; name: string; icon: string; level: number }>;
  /** title */
  titleText?: string;
}

const KIND_LABEL: Record<PreviewItem['kind'], string> = {
  card: 'Player card',
  buddy: 'Buddy',
  spray: 'Spray',
  title: 'Título',
  unknown: 'Ítem',
};

/**
 * Lightbox para los accesorios del bundle (player cards, buddies, sprays y
 * títulos). Las imágenes y el GIF animado de los sprays salen directo del CDN
 * de valorant-api.com: no se almacena nada.
 */
export function ItemPreview({ item, onClose }: { item: PreviewItem | null; onClose: () => void }) {
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [item, onClose]);

  if (!item || typeof document === 'undefined') return null;

  const isAnimated = item.kind === 'spray' && Boolean(item.animationGif || item.animationPng);
  const media =
    item.kind === 'card'
      ? item.largeArt || item.icon
      : item.kind === 'spray'
        ? item.animationGif || item.animationPng || item.fullIcon || item.icon
        : item.icon;

  return createPortal(
    <div className="skin-preview-overlay" onClick={onClose}>
      <div
        className={`skin-preview item-preview item-preview-${item.kind}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>

        {item.kind === 'title' ? (
          <div className="item-preview-title">{item.titleText || item.name}</div>
        ) : (
          <div className="skin-preview-img">
            {media ? (
              <Image
                src={media}
                alt={item.name}
                fill
                unoptimized={isAnimated}
                sizes="(max-width: 720px) 90vw, 480px"
                style={{ objectFit: 'contain' }}
              />
            ) : null}
          </div>
        )}

        <div className="skin-preview-name">{item.name}</div>
        <div className="skin-preview-weapon">{KIND_LABEL[item.kind]}</div>

        {item.kind === 'buddy' && (item.levels?.length ?? 0) > 1 ? (
          <div className="skin-preview-row">
            <span className="spr-label">Niveles</span>
            <div className="skin-preview-vars">
              {item.levels!.map((l) => (
                <span key={l.id} className={`skin-preview-var${l.icon ? '' : ' no-img'}`} title={l.name}>
                  {l.icon ? <Image src={l.icon} alt="" width={30} height={20} style={{ objectFit: 'contain' }} /> : null}
                  <span>{l.name}</span>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {isAnimated ? <p className="item-preview-note">Animación real del spray en partida.</p> : null}
      </div>
    </div>,
    document.body,
  );
}
