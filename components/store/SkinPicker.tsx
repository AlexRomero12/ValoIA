'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { SkinPreview } from './SkinPreview';

interface PickerSkin {
  id: string;
  name: string;
  icon: string;
  weapon: string;
}

interface WeaponsResponse {
  categories: Array<{
    name: string;
    weapons: Array<{ name: string; icon: string; count: number }>;
  }>;
}

const SEARCH_MIN = 2;

function SkeletonGrid({ cells }: { cells: number }) {
  return (
    <div className="picker-grid" aria-hidden>
      {Array.from({ length: cells }, (_, i) => (
        <div key={i} className="skin-cell skel">
          <div className="skin-cell-icon" />
          <div className="skel-line" />
          <div className="skel-line short" />
        </div>
      ))}
    </div>
  );
}

export function SkinPicker({
  favoriteIds,
  onToggle,
  onClose,
}: {
  favoriteIds: Set<string>;
  onToggle: (offerId: string) => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState('');
  const [weapon, setWeapon] = useState('');
  const [search, setSearch] = useState('');
  const [favs, setFavs] = useState<Set<string>>(new Set(favoriteIds));
  const [preview, setPreview] = useState<PickerSkin | null>(null);

  const weaponsQ = useQuery<WeaponsResponse>({
    queryKey: ['store-weapons'],
    queryFn: async () => {
      const res = await fetch('/api/store/weapons', { cache: 'no-store' });
      if (!res.ok) throw new Error('No se pudo cargar el arsenal');
      return (await res.json()) as WeaponsResponse;
    },
    staleTime: 60 * 60 * 1000,
  });

  const categories = weaponsQ.data?.categories ?? [];
  const activeCategory = category || categories[0]?.name || '';
  const weaponsInCategory = categories.find((c) => c.name === activeCategory)?.weapons ?? [];
  const activeWeapon = weapon || weaponsInCategory[0]?.name || '';
  const searching = search.trim().length >= SEARCH_MIN;

  const skinsQ = useQuery<PickerSkin[]>({
    queryKey: ['store-arsenal-weapon', activeWeapon],
    queryFn: async () => {
      const res = await fetch(`/api/store/catalog?weapon=${encodeURIComponent(activeWeapon)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('No se pudieron cargar las skins');
      const json = (await res.json()) as { results?: PickerSkin[] };
      return json.results ?? [];
    },
    enabled: !!activeWeapon && !searching,
    staleTime: 10 * 60 * 1000,
  });

  const searchQ = useQuery<PickerSkin[]>({
    queryKey: ['store-arsenal-search', search.trim()],
    queryFn: async () => {
      const res = await fetch(`/api/store/catalog?q=${encodeURIComponent(search.trim())}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('No se pudo buscar');
      const json = (await res.json()) as { results?: PickerSkin[] };
      return json.results ?? [];
    },
    enabled: searching,
    staleTime: 60 * 1000,
  });

  const showing = searching ? (searchQ.data ?? []) : (skinsQ.data ?? []);
  const loadingSkins = (!searching && skinsQ.isFetching) || (searching && searchQ.isFetching);

  const pickCategory = (name: string) => {
    setCategory(name);
    setWeapon('');
    setSearch('');
  };

  const toggle = (id: string) => {
    setFavs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    onToggle(id);
  };

  // Portal al body: el .panel que contiene este árbol tiene clip-path y
  // recortaría un modal position:fixed.
  if (typeof document === 'undefined') return null;

  return (
    <>
      {createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal picker" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} title="Cerrar">
          Cerrar
        </button>
        <div className="md-head">
          <div className="md-title">
            <h3>Explorar arsenal</h3>
            <div className="md-sub">Todas las skins del juego, por arma. Marca tus favoritas.</div>
          </div>
        </div>

        <input
          type="text"
          className="fav-input picker-search"
          placeholder="Buscar por nombre… (ej. Reaver, Prime, Champions)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {searching ? (
          <div className="picker-context">
            Resultados para «{search.trim()}»{' '}
            <button className="f-chip" onClick={() => setSearch('')}>
              Volver al arsenal
            </button>
          </div>
        ) : (
          <>
            <div className="picker-cats">
              {weaponsQ.data
                ? categories.map((c) => (
                    <button
                      key={c.name}
                      className={`picker-cat${activeCategory === c.name ? ' on' : ''}`}
                      onClick={() => pickCategory(c.name)}
                    >
                      {c.name}
                      <small>{c.weapons.reduce((a, w) => a + w.count, 0)}</small>
                    </button>
                  ))
                : Array.from({ length: 5 }, (_, i) => (
                    <button key={i} className="picker-cat skel" disabled>
                      &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                    </button>
                  ))}
            </div>

            <div className="picker-weapons">
              {weaponsQ.data
                ? weaponsInCategory.map((w) => (
                    <button
                      key={w.name}
                      className={`f-chip weapon-chip${activeWeapon === w.name ? ' on' : ''}`}
                      onClick={() => setWeapon(w.name)}
                      title={`${w.count} skins`}
                    >
                      {w.icon ? <img src={w.icon} alt="" loading="lazy" /> : null}
                      {w.name}
                      <b>{w.count}</b>
                    </button>
                  ))
                : Array.from({ length: 6 }, (_, i) => (
                    <span key={i} className="weapon-chip skel">
                      &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                    </span>
                  ))}
            </div>
          </>
        )}

        {loadingSkins ? (
          <SkeletonGrid cells={12} />
        ) : showing.length === 0 ? (
          <div className="picker-grid">
            <p className="empty">
              {weaponsQ.data
                ? searching
                  ? 'Sin resultados para esa búsqueda.'
                  : 'Elige un arma para ver sus skins.'
                : 'Cargando arsenal…'}
            </p>
          </div>
        ) : (
          <div className="picker-grid">
            {showing.map((s) => {
              const fav = favs.has(s.id);
              return (
                <div key={s.id} className={`skin-cell${fav ? ' fav' : ''}`} title={s.name}>
                  <div
                    className="skin-cell-icon previewable"
                    onClick={() => s.icon && setPreview(s)}
                    title={s.icon ? 'Ver en grande' : undefined}
                    role={s.icon ? 'button' : undefined}
                  >
                    {s.icon ? <img src={s.icon} alt="" loading="lazy" /> : null}
                  </div>
                  <span className="skin-cell-name">{s.name}</span>
                  <span className="skin-cell-weapon">{s.weapon}</span>
                  <button
                    className={`star-btn${fav ? ' on' : ''}`}
                    onClick={() => toggle(s.id)}
                    title={fav ? 'Quitar de favoritas' : 'Marcar como favorita'}
                  >
                    {fav ? '★' : '☆'} Favorita
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>, document.body)}
      <SkinPreview key={preview?.id ?? 'none'} skin={preview} favoriteIds={favs} onToggle={toggle} onClose={() => setPreview(null)} />
    </>
  );
}