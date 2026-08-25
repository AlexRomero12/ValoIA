'use client';

import { useMemo } from 'react';
import { useAgentIcons, agentIconLookup } from '@/lib/hooks';

interface AgentIconFilterProps {
  available: string[];
  selected: string[];
  onToggle: (name: string) => void;
}

export function AgentIconFilter({ available, selected, onToggle }: AgentIconFilterProps) {
  const { data } = useAgentIcons();
  const icons = useMemo(() => agentIconLookup(data), [data]);
  const selSet = new Set(selected);

  const names = [...available].sort((a, b) => a.localeCompare(b));

  if (!names.length) return <span className="muted" style={{ fontSize: 12 }}>—</span>;

  return (
    <div className="agent-icons">
      {names.map((name) => {
        const on = selSet.has(name);
        const icon = icons.get(name.toLowerCase()) ?? null;
        return (
          <button
            key={name}
            type="button"
            className={`agent-icon-btn${on ? ' on' : ''}`}
            onClick={() => onToggle(name)}
            title={on ? `Quitar ${name}` : `Añadir ${name}`}
            aria-pressed={on}
          >
            {icon ? (
              <img src={icon} alt={name} loading="lazy" />
            ) : (
              <span className="agent-letter">{name.slice(0, 1)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
