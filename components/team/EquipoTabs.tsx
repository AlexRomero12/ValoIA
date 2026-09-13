'use client';

export type EquipoTab = 'comparar' | 'composiciones';

export interface EquipoTabProps {
  tab: EquipoTab;
  onTab: (t: EquipoTab) => void;
}

const TABS: { key: EquipoTab; label: string }[] = [
  { key: 'comparar', label: 'Comparar' },
  { key: 'composiciones', label: 'Composiciones' },
];

export function isEquipoTab(value: string | null): value is EquipoTab {
  return value != null && TABS.some((t) => t.key === value);
}

/** Tabs del hub Equipo (estado en la URL vía `?tab=`). */
export function EquipoTabs({ tab, onTab }: EquipoTabProps) {
  return (
    <div className="ranked-tabs" role="tablist" aria-label="Vistas de Equipo">
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
