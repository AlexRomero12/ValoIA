'use client';

import { useState } from 'react';
import { SkinPicker } from './SkinPicker';
import { SkinPreview, type PreviewSkin } from './SkinPreview';

export interface FavoriteUI {
  offerId: string;
  name: string;
  icon: string;
  weapon: string;
  addedAt: number;
  inStoreToday: boolean;
  price?: number;
  notified: boolean;
}

export function FavoritesPanel({
  favorites,
  onChanged,
}: {
  favorites: FavoriteUI[];
  onChanged: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewSkin | null>(null);

  const toggle = async (offerId: string) => {
    await fetch('/api/store/favorites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: favorites.some((f) => f.offerId === offerId) ? 'remove' : 'add',
        offerId,
      }),
    });
    onChanged();
  };

  return (
    <div className="panel">
      <h2>
        Mis favoritas <span className="muted">({favorites.length})</span>
      </h2>

      <div className="fav-search">
        <button className="primary-red" onClick={() => setPickerOpen(true)}>
          + Añadir skins
        </button>
        <span className="push-state">
          Explora el arsenal por arma o busca por nombre.
        </span>
      </div>

      {favorites.length === 0 ? (
        <p className="empty">
          Sin favoritas aún. Pulsa «Añadir skins» para explorar el arsenal, o usa la estrella de la tienda de hoy.
        </p>
      ) : (
        <div className="fav-list">
          {favorites.map((f) => (
            <div key={f.offerId} className={`fav-row${f.inStoreToday ? ' in-store' : ''}`}>
              <div
                className="fav-icon previewable"
                onClick={() => f.icon && setPreview({ id: f.offerId, name: f.name, icon: f.icon, weapon: f.weapon })}
                title={f.icon ? 'Ver en grande' : undefined}
                role={f.icon ? 'button' : undefined}
              >
                {f.icon ? <img src={f.icon} alt="" loading="lazy" /> : null}
              </div>
              <div className="fav-info">
                <div className="fav-name" title={f.name}>{f.name}</div>
                <div className="fav-meta">{f.weapon || 'Skin'}</div>
              </div>
              {f.inStoreToday ? (
                <span className="badge-today" title={f.notified ? 'Ya se te notificó hoy' : undefined}>
                  {f.notified ? 'Notificada · ' : ''}¡EN TIENDA! {f.price} VP
                </span>
              ) : null}
              <button className="f-chip" onClick={() => void toggle(f.offerId)} title="Quitar de favoritas">
                Quitar
              </button>
            </div>
          ))}
        </div>
      )}

      {pickerOpen ? (
        <SkinPicker
          favoriteIds={new Set(favorites.map((f) => f.offerId))}
          onToggle={(offerId) => void toggle(offerId)}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}

      <SkinPreview
        key={preview?.id ?? 'none'}
        skin={preview}
        favoriteIds={new Set(favorites.map((f) => f.offerId))}
        onToggle={(offerId) => void toggle(offerId)}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}