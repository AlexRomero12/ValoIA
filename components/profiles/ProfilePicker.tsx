'use client';

import { profileColor, type Profile } from '@/lib/profileTypes';

interface ProfilePickerProps {
  profiles: Profile[];
  selected: string[];
  onChange: (ids: string[]) => void;
  onAddProfile?: () => void;
  /** Tope suave de selección (se avisa por tooltip). */
  max?: number;
  accent?: string;
  single?: boolean;
  label?: string;
}

/**
 * Chips multi-select de perfiles (o single para Auditoría). Los visibles
 * vienen preseleccionados por la página; aquí se puede ajustar y agregar.
 */
export function ProfilePicker({ profiles, selected, onChange, onAddProfile, max, accent = '#ff4655', single = false, label }: ProfilePickerProps) {
  const toggle = (id: string) => {
    if (single) {
      onChange([id]);
      return;
    }
    if (selected.includes(id)) {
      onChange(selected.filter((x) => x !== id));
      return;
    }
    if (max != null && selected.length >= max) return;
    onChange([...selected, id]);
  };

  const overLimit = max != null && selected.length >= max;

  return (
    <div className="profile-picker" style={{ ['--accent-row' as string]: accent }}>
      {label ? <label>{label}</label> : null}
      <div className="player-chips">
        {profiles.map((p) => {
          const on = selected.includes(p.id);
          const disabled = !on && !single && overLimit;
          return (
            <button
              key={p.id}
              className={`f-chip profile-chip${on ? (single ? ' player-on' : ' profile-on') : ''}`}
              style={on ? { borderColor: profileColor(p), color: '#fff', background: `${profileColor(p)}26` } : undefined}
              title={disabled ? `Máximo ${max} perfiles seleccionados` : `${p.name}#${p.tag}${p.role ? ` · ${p.role}` : ''}`}
              onClick={() => toggle(p.id)}
              disabled={disabled}
            >
              <span className="p-dot" style={{ background: profileColor(p) }} />
              {p.label}
            </button>
          );
        })}
        {onAddProfile ? (
          <button className="f-chip profile-chip add" onClick={onAddProfile} title="Crear un perfil nuevo">
            + Agregar perfil
          </button>
        ) : null}
      </div>
    </div>
  );
}
