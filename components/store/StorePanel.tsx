'use client';

import { useState } from 'react';
import Image from 'next/image';
import { SkinPreview, type PreviewSkin } from './SkinPreview';
import { ItemPreview, type PreviewItem } from './ItemPreview';
import type { StoreDailyItemUI, StoreBundleUI, StoreItemUI } from '@/app/api/store/status/route';

export type { StoreDailyItemUI, StoreBundleUI };

const KIND_SHORT: Record<StoreItemUI['kind'], string> = {
  skin: 'Skin',
  card: 'Card',
  buddy: 'Buddy',
  spray: 'Spray',
  title: 'Título',
  unknown: 'Ítem',
};

export function fmtDuration(sec: number): string {
  if (!sec || sec <= 0) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Chip de conteos: "N4 · V3" = 4 niveles de evolución, 3 variantes de color. */
export function Counts({ levelCount, variantCount }: { levelCount?: number; variantCount?: number }) {
  const parts: string[] = [];
  if ((levelCount ?? 0) > 1) parts.push(`N${levelCount}`);
  if ((variantCount ?? 0) > 0) parts.push(`V${variantCount}`);
  if (!parts.length) return null;
  return (
    <div className="skin-counts" title="Niveles de evolución · Variantes de color">
      {parts.join(' · ')}
    </div>
  );
}

export function StorePanel({
  daily,
  dailyRemainingSec,
  fetchedAt,
  source,
  sourceDetail,
  bundle,
  favoriteIds,
  onToggleFavorite,
}: {
  daily: StoreDailyItemUI[];
  dailyRemainingSec: number;
  fetchedAt: number;
  source: 'rso' | 'none';
  sourceDetail: string;
  bundle: StoreBundleUI | null;
  favoriteIds?: Set<string>;
  onToggleFavorite: (offerId: string) => void;
}) {
  const updated = new Date(fetchedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  const [skinPreview, setSkinPreview] = useState<PreviewSkin | null>(null);
  const [itemPreview, setItemPreview] = useState<PreviewItem | null>(null);

  // Abre el lightbox que toque: skins (niveles/variantes/vídeo) o accesorio.
  const openItem = (it: StoreItemUI) => {
    if (it.kind === 'skin') {
      setSkinPreview({
        id: it.id,
        name: it.name,
        icon: it.icon,
        weapon: it.weapon ?? '',
        rarity: it.rarity,
        rarityColor: it.rarityColor,
        collection: it.collection,
      });
      return;
    }
    if (it.kind === 'unknown') return;
    setItemPreview({
      kind: it.kind,
      id: it.id,
      name: it.name,
      icon: it.icon,
      largeArt: it.largeArt,
      fullIcon: it.fullIcon,
      animationGif: it.animationGif,
      animationPng: it.animationPng,
      levels: it.levels,
      titleText: it.titleText,
    });
  };

  const bundleArt = bundle?.art?.promoImage || bundle?.art?.icon || null;

  return (
    <div className="panel">
      <h2>Tienda de hoy</h2>

      <div className="store-window">
        <span className="store-window-label">Ventana de tienda</span>
        <span className="store-window-time">{fmtDuration(dailyRemainingSec)}</span>
      </div>

      {daily.length === 0 ? (
        <p className="empty">
          {source === 'none'
            ? 'Sin conexión con la tienda: el Riot Client está cerrado y el respaldo RSO no está disponible.'
            : 'La tienda aún no responde.'}
        </p>
      ) : (
        <div className="store-grid">
          {daily.map((d) => (
            <div key={d.offerId} className={`store-card${d.isFavorite ? ' fav' : ''}`}>
              <div
                className="store-icon previewable"
                onClick={() => openItem(d)}
                title="Ver niveles, variantes y vídeo"
                role="button"
              >
                {d.icon ? (
                  <Image src={d.icon} alt="" fill sizes="(max-width: 720px) 45vw, 160px" style={{ objectFit: 'contain' }} />
                ) : null}
              </div>
              <div className="store-name" title={d.name}>{d.name}</div>
              <div className="store-meta">
                {d.weapon ? `${d.weapon} · ` : ''}
                <span className="price-tag">{d.price} VP</span>
              </div>
              <Counts levelCount={d.levelCount} variantCount={d.variantCount} />
              <button
                className={`star-btn${d.isFavorite ? ' on' : ''}`}
                onClick={() => onToggleFavorite(d.offerId)}
                title={d.isFavorite ? 'Quitar de favoritas' : 'Marcar como favorita'}
              >
                {d.isFavorite ? '★' : '☆'} Favorita
              </button>
            </div>
          ))}
        </div>
      )}

      {bundle && bundle.items.length > 0 ? (
        <div className="bundle">
          <div className="bundle-head">
            {bundleArt ? (
              <Image className="bundle-art" src={bundleArt} alt="" width={46} height={46} style={{ objectFit: 'cover' }} />
            ) : null}
            <span className="bundle-title">{bundle.art?.name ?? bundle.name ?? 'Bundle destacado'}</span>
            {bundle.discountPercent && bundle.discountPercent > 0 ? (
              <span className="bundle-disc">
                -{bundle.discountPercent <= 1 ? Math.round(bundle.discountPercent * 100) : Math.round(bundle.discountPercent)}%
              </span>
            ) : null}
            <span className="bundle-meta">
              {bundle.totalDiscountedCost ?? bundle.totalBaseCost} VP
              {bundle.totalDiscountedCost ? ` (antes ${bundle.totalBaseCost} VP)` : ''} · {fmtDuration(bundle.durationSec)}
            </span>
          </div>
          {bundle.art?.description ? <p className="bundle-desc">{bundle.art.description}</p> : null}
          <div className="bundle-items">
            {bundle.items.map((it) => (
              <div
                key={it.itemId}
                className="bundle-item previewable"
                title={`${KIND_SHORT[it.kind]} · ${it.name}`}
                onClick={() => openItem(it)}
                role="button"
              >
                {it.icon ? <Image src={it.icon} alt="" width={44} height={28} style={{ objectFit: 'contain' }} /> : null}
                <span className="bundle-item-name">{it.name}</span>
                <small className="bundle-item-kind">{KIND_SHORT[it.kind]}</small>
                {it.price ? <span className="bundle-item-price">{it.price} VP</span> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="store-foot">
        <span>
          actualizado {updated}
        </span>
              <span className={source === 'rso' ? 'src-rso' : 'src-none'}>
          {sourceDetail}
        </span>
      </div>

      <SkinPreview
        key={skinPreview?.id ?? 'none'}
        skin={skinPreview}
        favoriteIds={favoriteIds}
        onToggle={onToggleFavorite}
        onClose={() => setSkinPreview(null)}
      />
      <ItemPreview key={itemPreview?.id ?? 'none'} item={itemPreview} onClose={() => setItemPreview(null)} />
    </div>
  );
}
