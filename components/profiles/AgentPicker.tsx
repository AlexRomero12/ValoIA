'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAgentIcons } from '@/lib/hooks';

interface AgentPickerProps {
  selected: string[];
  onChange: (agents: string[]) => void;
  label?: string;
  accent?: string;
  /** true = chips compactos sin panel de búsqueda (para filas de pool) */
  compact?: boolean;
  placeholder?: string;
}

/**
 * Selector multi-agente con iconos del catálogo. Muestra los ya elegidos como
 * chips removibles y un panel buscable con el resto.
 */
export function AgentPicker({ selected, onChange, label, accent = '#ff4655', compact = false, placeholder = 'Agregar agente…' }: AgentPickerProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const iconsQ = useAgentIcons();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [open]);

  // En táctil no enfocamos el buscador: abrir el teclado al tocar molesta.
  useEffect(() => {
    if (!open) return;
    const fine = typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (fine) searchRef.current?.focus();
  }, [open]);

  const catalog = useMemo(() => iconsQ.data ?? [], [iconsQ.data]);
  const iconOf = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const a of catalog) map.set(a.name.toLowerCase(), a.icon);
    return map;
  }, [catalog]);

  const options = useMemo(() => {
    const known = new Map(catalog.map((a) => [a.name.toLowerCase(), a]));
    const all = new Set<string>([...catalog.map((a) => a.name), ...selected]);
    return [...all]
      .sort((a, b) => a.localeCompare(b))
      .filter((name) => name.toLowerCase().includes(q.trim().toLowerCase()))
      .map((name) => ({ name, icon: iconOf.get(name.toLowerCase()) ?? known.get(name.toLowerCase())?.icon ?? null }));
  }, [catalog, selected, q, iconOf]);

  const toggle = (name: string) => {
    onChange(selected.includes(name) ? selected.filter((a) => a !== name) : [...selected, name]);
  };

  return (
    <div className={`agent-picker${compact ? ' compact' : ''}`} ref={boxRef} style={{ ['--accent-row' as string]: accent }}>
      <div className="agent-chips">
        {selected.map((name) => (
          <span key={name} className="agent-chip on">
            {iconOf.get(name.toLowerCase()) ? <img src={iconOf.get(name.toLowerCase())!} alt="" /> : null}
            <b>{name}</b>
            <button type="button" className="agent-x" onClick={() => toggle(name)} aria-label={`Quitar ${name}`}>✕</button>
          </span>
        ))}
        <button type="button" className={`agent-chip add${open ? ' open' : ''}`} onClick={() => setOpen((v) => !v)}>
          + {placeholder}
        </button>
      </div>

      {open && (
        <div className="agent-panel">
          <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar agente…" className="agent-search" />
          <div className="agent-grid">
            {options.length === 0 && <span className="empty">Sin resultados</span>}
            {options.map(({ name, icon }) => (
              <button
                key={name}
                type="button"
                className={`agent-opt${selected.includes(name) ? ' on' : ''}`}
                onClick={() => toggle(name)}
                title={name}
              >
                {icon ? <img src={icon} alt="" /> : <span className="agent-opt-none" />}
                <span>{name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {label ? <span className="agent-picker-label">{label}</span> : null}
    </div>
  );
}
