'use client';

export type RankedTab = 'resumen' | 'agentes' | 'mapas' | 'arsenal' | 'aperturas';

const TABS: { key: RankedTab; label: string }[] = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'agentes', label: 'Agentes' },
  { key: 'mapas', label: 'Mapas' },
  { key: 'arsenal', label: 'Arsenal' },
  { key: 'aperturas', label: 'Aperturas' },
];

export function isRankedTab(value: string | null): value is RankedTab {
  return value != null && TABS.some((t) => t.key === value);
}

/** Tabs internas del hub Ranked (estado en la URL vía `?tab=`). */
export function RankedTabs({ tab, onTab }: { tab: RankedTab; onTab: (t: RankedTab) => void }) {
  return (
    <div className="ranked-tabs" role="tablist" aria-label="Vistas de Ranked">
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={tab === t.key}
          className={tab === t.key ? 'on' : ''}
          onClick={() => onTab(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
