'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
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

interface LevelInfo {
  id: string;
  label: string;
  icon: string;
}

/**
 * Lightbox de previsualización: render grande de la skin, selector de niveles
 * de evolución y variantes de color, y toggle de favorita. Solo imágenes
 * (los videos de Riot pesan 28–117 MB; no se descargan). Portal al body porque
 * los .panel tienen clip-path y recortarían un modal fixed.
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
  const [level, setLevel] = useState<LevelInfo | null>(null);

  const variantsQ = useQuery<{ chromas: ChromaInfo[]; levels: LevelInfo[] }>({
    queryKey: ['store-variants', skin?.id],
    queryFn: async () => {
      const res = await fetch(`/api/store/chromas?id=${encodeURIComponent(skin!.id)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('No se pudieron cargar las variantes');
      const json = (await res.json()) as { chromas?: ChromaInfo[]; levels?: LevelInfo[] };
      return { chromas: json.chromas ?? [], levels: json.levels ?? [] };
    },
    enabled: !!skin?.id,
    staleTime: 60 * 60 * 1000,
  });

  // Al cambiar de skin el padre remonta este componente (key=skin.id):
  // `variant`/`level` vuelven a null sin necesidad de effects.

  useEffect(() => {
    if (!skin) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [skin, onClose]);

  // Bloquea el scroll del body mientras el lightbox está abierto.
  useEffect(() => {
    if (!skin) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [skin]);

  if (!skin || typeof document === 'undefined') return null;

  const chromas = variantsQ.data?.chromas ?? [];
  const levels = variantsQ.data?.levels ?? [];
  const shown = level ?? variant ?? { id: skin.id, name: skin.name, icon: skin.icon };
  const shownId = level?.id ?? variant?.id ?? skin.id;
  // La API solo trae render del nivel base: al elegir otro nivel se mantiene la
  // imagen del skin para que el lightbox no quede en blanco.
  const mainIcon = shown.icon || skin.icon;
  const isFav = favoriteIds?.has(skin.id) ?? false;

  return createPortal(
    <div className="skin-preview-overlay" onClick={onClose}>
      <div className="skin-preview" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        <div className="skin-preview-img">
          {mainIcon ? (
            <Image
              src={mainIcon}
              alt={skin.name}
              fill
              sizes="(max-width: 720px) 90vw, 420px"
              style={{ objectFit: 'contain' }}
            />
          ) : null}
        </div>
        <div className="skin-preview-name">{skin.name}</div>
        <div className="skin-preview-weapon">
          {variant ? variant.label : level ? level.label : skin.weapon || 'Skin'}
        </div>

        {levels.length > 1 ? (
          <div className="skin-preview-row">
            <span className="spr-label">Niveles</span>
            <div className="skin-preview-vars">
              {levels.map((l) => (
                <button
                  key={l.id}
                  className={`skin-preview-var${shownId === l.id ? ' on' : ''}${l.icon ? '' : ' no-img'}`}
                  onClick={() => { setLevel(l); setVariant(null); }}
                  title={l.icon ? l.label : `${l.label} · sin render en la API`}
                >
                  {l.icon ? <Image src={l.icon} alt="" width={30} height={20} style={{ objectFit: 'contain' }} /> : null}
                  <span>{l.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {chromas.length > 1 ? (
          <div className="skin-preview-row">
            <span className="spr-label">Variantes</span>
            <div className="skin-preview-vars">
              {chromas.map((c) => (
                <button
                  key={c.id}
                  className={`skin-preview-var${shownId === c.id ? ' on' : ''}${c.icon ? '' : ' no-img'}`}
                  onClick={() => { setVariant(c); setLevel(null); }}
                  title={c.icon ? c.label : `${c.label} · sin render en la API`}
                >
                  {c.icon ? <Image src={c.icon} alt="" width={30} height={20} style={{ objectFit: 'contain' }} /> : null}
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
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
