'use client';

import { useState } from 'react';
import { SkinPreview, type PreviewSkin } from './SkinPreview';

export interface StoreDailyItemUI {
  offerId: string;
  price: number;
  name: string;
  icon: string;
  weapon: string;
  isFavorite: boolean;
}

export interface StoreBundleUI {
  id: string;
  name?: string;
  durationSec: number;
  totalBaseCost?: number;
  totalDiscountedCost?: number;
  discountPercent?: number;
  items: Array<{ itemId: string; price?: number; name: string; icon: string; weapon: string }>;
}

export function fmtDuration(sec: number): string {
  if (!sec || sec <= 0) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
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
  source: 'local' | 'rso' | 'none';
  sourceDetail: string;
  bundle: StoreBundleUI | null;
  favoriteIds?: Set<string>;
  onToggleFavorite: (offerId: string) => void;
}) {
  const updated = new Date(fetchedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  const [preview, setPreview] = useState<PreviewSkin | null>(null);
  const openPreview = (s: PreviewSkin) => {
    if (s.icon) setPreview(s);
  };

  return (
    <div className="panel">
      <h2>Tienda de hoy</h2>

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
                onClick={() => openPreview({ id: d.offerId, name: d.name, icon: d.icon, weapon: d.weapon })}
                title="Ver en grande"
                role={d.icon ? 'button' : undefined}
              >
                {d.icon ? <img src={d.icon} alt="" loading="lazy" /> : null}
              </div>
              <div className="store-name" title={d.name}>{d.name}</div>
              <div className="store-meta">
                {d.weapon ? `${d.weapon} · ` : ''}{d.price} VP
              </div>
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
            <span className="bundle-title">Bundle destacado</span>
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
          <div className="bundle-items">
            {bundle.items.map((it) => (
              <div
                key={it.itemId}
                className="bundle-item previewable"
                title={it.icon ? 'Ver en grande' : it.name}
                onClick={() => openPreview({ id: it.itemId, name: it.name, icon: it.icon, weapon: it.weapon })}
                role={it.icon ? 'button' : undefined}
              >
                {it.icon ? <img src={it.icon} alt="" loading="lazy" /> : null}
                <span>{it.name}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="store-foot">
        <span>
          Rota en {fmtDuration(dailyRemainingSec)} · actualizado {updated}
        </span>
        <span className={source === 'local' ? 'src-local' : source === 'rso' ? 'src-rso' : 'src-none'}>
          {sourceDetail}
        </span>
      </div>

      <SkinPreview key={preview?.id ?? 'none'} skin={preview} favoriteIds={favoriteIds} onToggle={onToggleFavorite} onClose={() => setPreview(null)} />
    </div>
  );
}