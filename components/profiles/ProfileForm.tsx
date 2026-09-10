'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useProfileActions, type ProfileInput } from '@/lib/hooks';
import { ROTATION_MAPS } from '@/lib/proneta';
import {
  PROFILE_COLORS,
  cloneAuditRules,
  emptyAuditRules,
  type AuditRules,
  type Profile,
  type ProfileAccount,
  type ProfilePref,
} from '@/lib/profileTypes';
import { AuditRulesEditor } from './AuditRulesEditor';

interface ProfileFormProps {
  /** null = nuevo perfil */
  profile: Profile | null;
  profiles: Profile[];
  onClose: () => void;
  onSaved?: (profiles: Profile[]) => void;
}

export function ProfileForm({ profile, profiles, onClose, onSaved }: ProfileFormProps) {
  const actions = useProfileActions();
  const [label, setLabel] = useState(profile?.label ?? '');
  const [name, setName] = useState(profile?.name ?? '');
  const [tag, setTag] = useState(profile?.tag ?? '');
  const [role, setRole] = useState(profile?.role ?? '');
  const [color, setColor] = useState(profile?.color ?? '');
  const [visible, setVisible] = useState(profile?.visible ?? true);
  const [accounts, setAccounts] = useState<ProfileAccount[]>(profile?.accounts ?? []);
  const [prefs, setPrefs] = useState<ProfilePref[]>(profile?.prefs ?? []);
  const [audit, setAudit] = useState<AuditRules | null>(profile?.audit ? cloneAuditRules(profile.audit) : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const iconState = useMemo(() => (audit ? 'on' : 'off'), [audit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const save = async () => {
    if (busy) return;
    setError(null);
    if (!name.trim() || !tag.trim()) {
      setError('El perfil necesita Riot ID (nombre y tag).');
      return;
    }
    setBusy(true);
    const payload: ProfileInput = {
      id: profile?.id,
      label: label.trim() || name.trim(),
      name: name.trim(),
      tag: tag.trim(),
      role: role.trim(),
      color: color.trim() || undefined,
      visible,
      accounts: accounts.filter((a) => a.name.trim() && a.tag.trim()),
      prefs: prefs.filter((p) => p.map && p.agents.length > 0),
      audit: audit === null ? null : audit,
    };
    const res = await actions.upsert(payload);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'No se pudo guardar');
      return;
    }
    onSaved?.(res.profiles ?? []);
    onClose();
  };

  const remove = async () => {
    if (!profile || busy) return;
    if (!window.confirm(`¿Borrar el perfil ${profile.label}? Sus partidas no se borran, solo la configuración.`)) return;
    setBusy(true);
    const res = await actions.remove(profile.id);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'No se pudo borrar');
      return;
    }
    onSaved?.(res.profiles ?? []);
    onClose();
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal profile-modal">
        <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>

        <header className="pf-head">
          <h3>{profile ? `Editar ${profile.label}` : 'Nuevo perfil'}</h3>
          <span className="window-info">Riot ID, rol y reglas de auditoría. Visible = aparece en Ranked/Auditoría.</span>
        </header>

        <section className="pf-section">
          <h4>Datos</h4>
          <div className="pf-grid">
            <label className="pf-field">
              <span>Etiqueta</span>
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Mi perfil" />
            </label>
            <label className="pf-field grow">
              <span>Nombre Riot</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="TuNombreRiot" />
            </label>
            <label className="pf-field">
              <span>Tag</span>
              <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="0000" />
            </label>
            <label className="pf-field grow">
              <span>Rol</span>
              <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Duelist/Sentinel" />
            </label>
          </div>
          <div className="pf-row">
            <span className="pf-label">Color</span>
            <div className="pf-colors">
              <button
                type="button"
                className={`pf-color auto${!color ? ' on' : ''}`}
                title="Automático (paleta)"
                onClick={() => setColor('')}
              >
                A
              </button>
              {PROFILE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`pf-color${color === c ? ' on' : ''}`}
                  style={{ background: c }}
                  title={c}
                  aria-label={`Color ${c}`}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
          <label className="pf-check">
            <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
            <span>Visible en Ranked y Auditoría</span>
          </label>
        </section>

        <section className="pf-section">
          <div className="pf-section-head">
            <h4>Cuentas alternativas</h4>
            <button
              type="button"
              className="f-chip"
              onClick={() => setAccounts((a) => [...a, { name: '', tag: '' }])}
            >
              + Añadir cuenta
            </button>
          </div>
          <p className="window-info">Las stats de estas cuentas se mezclan en la vista Comparar (mismo jugador).</p>
          {accounts.map((a, i) => (
            <div key={i} className="pf-inline">
              <input
                value={a.name}
                placeholder="Nombre"
                onChange={(e) => setAccounts((list) => list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              />
              <input
                value={a.tag}
                placeholder="Tag"
                onChange={(e) => setAccounts((list) => list.map((x, j) => (j === i ? { ...x, tag: e.target.value } : x)))}
              />
              <button type="button" className="rule-clear" onClick={() => setAccounts((list) => list.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
        </section>

        <section className="pf-section">
          <div className="pf-section-head">
            <h4>Preferencia de agente por mapa</h4>
            <button type="button" className="f-chip" onClick={() => setPrefs((p) => [...p, { map: ROTATION_MAPS[0] ?? 'Ascent', agents: [] }])}>
              + Añadir preferencia
            </button>
          </div>
          <p className="window-info">Gana sobre el score automático en las composiciones de Team (agentes separados por coma).</p>
          {prefs.map((p, i) => (
            <div key={i} className="pf-inline">
              <select
                value={p.map}
                onChange={(e) => setPrefs((list) => list.map((x, j) => (j === i ? { ...x, map: e.target.value } : x)))}
              >
                {[...new Set([...ROTATION_MAPS, p.map])].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <input
                className="grow"
                value={p.agents.join(', ')}
                placeholder="Chamber, Sage"
                onChange={(e) =>
                  setPrefs((list) =>
                    list.map((x, j) =>
                      j === i ? { ...x, agents: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) } : x,
                    ),
                  )
                }
              />
              <button type="button" className="rule-clear" onClick={() => setPrefs((list) => list.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
        </section>

        <section className="pf-section">
          <div className="pf-section-head">
            <h4>Auditoría</h4>
            {audit ? (
              <button type="button" className="f-chip" onClick={() => setAudit(null)}>Quitar reglas</button>
            ) : (
              <button type="button" className={`f-chip${iconState === 'off' ? '' : ' player-on'}`} onClick={() => setAudit(emptyAuditRules())}>
                + Configurar reglas
              </button>
            )}
          </div>
          {audit ? (
            <AuditRulesEditor
              rules={audit}
              maps={ROTATION_MAPS}
              otherProfiles={profiles.filter((p) => p.id !== profile?.id)}
              onChange={setAudit}
            />
          ) : (
            <p className="window-info">
              Sin reglas: la auditoría de este perfil solo medirá cortes/pausas con los defaults (2 derrotas con K/D &lt; 0.9 · pausa 3 h).
            </p>
          )}
        </section>

        {error ? <div className="banner error" style={{ marginTop: 14 }}>{error}</div> : null}

        <footer className="pf-footer">
          <button className="primary-red" onClick={save} disabled={busy}>
            Guardar{busy ? <span className="loader" /> : null}
          </button>
          {profile ? (
            <button onClick={remove} disabled={busy}>Borrar perfil</button>
          ) : null}
          <button onClick={onClose} disabled={busy}>Cancelar</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
