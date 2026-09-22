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
  rarity?: string | null;
  rarityColor?: string | null;
  collection?: string | null;
}

interface LevelInfo {
  id: string;
  label: string;
  icon: string;
  video?: string | null;
}

interface ChromaInfo {
  id: string;
  name: string;
  icon: string;
  label: string;
  fullRender?: string | null;
  video?: string | null;
}

type Selection = { kind: 'level' | 'chroma'; id: string };

/**
 * Lightbox de previsualización de una skin: niveles de evolución, variantes de
 * color y vídeo ingame del elemento seleccionado.
 *
 * Los vídeos (`streamedVideo` de valorant-api) se reproducen directo desde el
 * CDN de Riot (`valorant.dyn.riotcdn.net`) con click-to-play: no se descarga
 * nada hasta pulsar «Ver ingame» y nunca se almacena en el servidor.
 *
 * Portal al body porque los .panel tienen clip-path y recortarían un modal fixed.
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
  const variantsQ = useQuery<{ levels: LevelInfo[]; chromas: ChromaInfo[] }>({
    queryKey: ['store-variants', skin?.id],
    queryFn: async () => {
      const res = await fetch(`/api/store/chromas?id=${encodeURIComponent(skin!.id)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('No se pudieron cargar los niveles/variantes');
      const json = (await res.json()) as { levels?: LevelInfo[]; chromas?: ChromaInfo[] };
      return { levels: json.levels ?? [], chromas: json.chromas ?? [] };
    },
    enabled: !!skin?.id,
    staleTime: 60 * 60 * 1000,
  });

  const [sel, setSel] = useState<Selection | null>(null);
  // El vídeo se identifica por su "mediaKey": al cambiar de nivel/variante el
  // play se reinicia sin effects (no queda reproduciendo el anterior).
  const [playingFor, setPlayingFor] = useState<string | null>(null);
  const [errorFor, setErrorFor] = useState<string | null>(null);

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

  const levels = variantsQ.data?.levels ?? [];
  const chromas = variantsQ.data?.chromas ?? [];
  const defaultLevelId = levels.some((l) => l.id === skin.id) ? skin.id : levels[0]?.id;
  const active: Selection | null = sel ?? (defaultLevelId ? { kind: 'level', id: defaultLevelId } : null);
  const activeLevel = active?.kind === 'level' ? levels.find((l) => l.id === active.id) : undefined;
  const activeChroma = active?.kind === 'chroma' ? chromas.find((c) => c.id === active.id) : undefined;

  const mediaKey = activeChroma?.id ?? activeLevel?.id ?? skin.id;
  // Los niveles 2+ suelen no traer render: se cae al render base de la skin.
  const mediaIcon = activeChroma ? activeChroma.fullRender || activeChroma.icon : activeLevel?.icon || skin.icon;
  const videoUrl = activeChroma?.video ?? activeLevel?.video ?? null;
  const playing = playingFor === mediaKey && errorFor !== mediaKey;
  const isFav = favoriteIds?.has(skin.id) ?? false;
  const variantLabel = activeChroma ? activeChroma.label : activeLevel ? activeLevel.label : null;

  return createPortal(
    <div className="skin-preview-overlay" onClick={onClose}>
      <div className="skin-preview" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>

        <div className="skin-preview-img">
          {playing && videoUrl ? (
            <video
              key={mediaKey}
              className="skin-preview-video"
              src={videoUrl}
              poster={mediaIcon || undefined}
              controls
              autoPlay
              muted
              loop
              playsInline
              onError={() => setErrorFor(mediaKey)}
            />
          ) : (
            <>
              {mediaIcon ? (
                <Image
                  src={mediaIcon}
                  alt={skin.name}
                  fill
                  sizes="(max-width: 720px) 90vw, 420px"
                  style={{ objectFit: 'contain' }}
                />
              ) : null}
              {videoUrl ? (
                <button
                  className="skin-preview-play"
                  onClick={() => setPlayingFor(mediaKey)}
                  title="Reproducir vídeo ingame"
                >
                  <span className="spr-play-icon" aria-hidden>▶</span> Ver ingame
                </button>
              ) : null}
            </>
          )}
        </div>

        <div className="skin-preview-name">{skin.name}</div>
        <div className="skin-preview-weapon">
          {variantLabel ? `${skin.weapon ? `${skin.weapon} · ` : ''}${variantLabel}` : skin.weapon || 'Skin'}
        </div>

        {skin.rarity || skin.collection ? (
          <div className="skin-preview-collection">
            {skin.rarity ? (
              <span className="skin-cell-rarity" style={{ color: skin.rarityColor ?? undefined }}>
                {skin.rarity}
              </span>
            ) : null}
            {skin.collection ? <span>{skin.collection}</span> : null}
          </div>
        ) : null}

        {levels.length > 1 ? (
          <div className="skin-preview-row">
            <span className="spr-label">Niveles</span>
            <div className="skin-preview-vars">
              {levels.map((l) => {
                const on = active?.kind === 'level' && active.id === l.id;
                return (
                  <button
                    key={l.id}
                    className={`skin-preview-var${on ? ' on' : ''}${l.icon ? '' : ' no-img'}`}
                    onClick={() => setSel({ kind: 'level', id: l.id })}
                    title={l.icon ? l.label : `${l.label}${l.video ? ' · ver ingame' : ' · sin render en la API'}`}
                  >
                    {l.icon ? <Image src={l.icon} alt="" width={30} height={20} style={{ objectFit: 'contain' }} /> : null}
                    <span>
                      {l.label}
                      {l.video ? <span className="spr-video-dot" aria-hidden> ▶</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {chromas.length > 1 ? (
          <div className="skin-preview-row">
            <span className="spr-label">Variantes</span>
            <div className="skin-preview-vars">
              {chromas.map((c) => {
                const on = active?.kind === 'chroma' && active.id === c.id;
                return (
                  <button
                    key={c.id}
                    className={`skin-preview-var${on ? ' on' : ''}${c.icon ? '' : ' no-img'}`}
                    onClick={() => setSel({ kind: 'chroma', id: c.id })}
                    title={c.icon ? c.label : `${c.label}${c.video ? ' · ver ingame' : ' · sin render en la API'}`}
                  >
                    {c.icon ? <Image src={c.icon} alt="" width={30} height={20} style={{ objectFit: 'contain' }} /> : null}
                    <span>
                      {c.label}
                      {c.video ? <span className="spr-video-dot" aria-hidden> ▶</span> : null}
                    </span>
                  </button>
                );
              })}
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
