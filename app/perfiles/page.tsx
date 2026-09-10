'use client';

import { useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { ProfileForm } from '@/components/profiles/ProfileForm';
import { useProfileActions, useProfiles } from '@/lib/hooks';
import { profileColor, memberAccounts, type Profile } from '@/lib/profileTypes';

export default function PerfilesPage() {
  const profilesQ = useProfiles();
  const actions = useProfileActions();
  const [editing, setEditing] = useState<Profile | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const profiles = profilesQ.data ?? [];

  const toggleVisible = async (p: Profile) => {
    if (busyId) return;
    setBusyId(p.id);
    setError(null);
    const res = await actions.upsert({ id: p.id, name: p.name, tag: p.tag, visible: !p.visible });
    setBusyId(null);
    if (!res.ok) setError(res.error ?? 'No se pudo cambiar la visibilidad');
  };

  const makePrimary = async (p: Profile) => {
    if (busyId || p.primary) return;
    setBusyId(p.id);
    setError(null);
    const res = await actions.upsert({ id: p.id, name: p.name, tag: p.tag, primary: true });
    setBusyId(null);
    if (!res.ok) setError(res.error ?? 'No se pudo marcar el perfil principal');
  };

  return (
    <div className="wrap">
      <TopBar
        accent="red"
        title="Perfiles"
        subtitle={['Equipo', 'Config']}
        chip={
          <span className="chip-red">
            {profilesQ.isLoading ? 'cargando…' : `${profiles.filter((p) => p.visible).length}/${profiles.length} visibles`}
          </span>
        }
        updated={null}
        onRefresh={() => void profilesQ.refetch()}
        loading={profilesQ.isFetching}
        activePage="perfiles"
      />

      <LoadingOverlay
        open={profilesQ.isLoading}
        title="Cargando perfiles"
        message="Leyendo data/profiles.json"
        blocking
      />

      {error ? <div className="banner error">{error}</div> : null}
      {profilesQ.error ? <div className="banner error">{(profilesQ.error as Error).message}</div> : null}

      <div className="panel" style={{ marginTop: 20 }}>
        <div className="pf-section-head">
          <h2 style={{ margin: 0 }}>Perfiles</h2>
          <button className="primary-red" onClick={() => setCreating(true)}>+ Nuevo perfil</button>
        </div>
        <p className="window-info" style={{ marginTop: 8 }}>
          Elige el <b>perfil principal</b> (★): es el único que se audita y del que se muestra la tienda.
          Los <b>visibles</b> aparecen en Ranked; Comparar y Team pueden usar cualquier perfil guardado.
        </p>

        {profiles.length === 0 && !profilesQ.isLoading ? (
          <p className="empty" style={{ marginTop: 16 }}>No hay perfiles. Crea el primero con “Nuevo perfil”.</p>
        ) : (
          <div className="profiles-list">
            {profiles.map((p, i) => {
              const color = profileColor(p, i);
              const accs = memberAccounts(p);
              const mapsWithRule = p.audit ? Object.keys(p.audit.pool.byMap).length : 0;
              return (
                <div key={p.id} className={`profile-card${p.visible ? '' : ' off'}${p.primary ? ' primary' : ''}`} style={{ ['--pc' as string]: color }}>
                  <span className="profile-card-dot" />
                  <div className="profile-card-main">
                    <div className="profile-card-title">
                      <b>{p.label}</b>
                      {p.primary ? <span className="profile-primary-badge">★ Principal</span> : null}
                      <span className="window-info">{p.name}#{p.tag}</span>
                      {p.role ? <span className="profile-role">{p.role}</span> : null}
                    </div>
                    <div className="profile-card-meta">
                      {accs.length > 1 ? <span className="mini-stats">{accs.length} cuentas</span> : null}
                      {p.audit ? (
                        <span className="mini-stats" title={`rules v${p.audit.rulesVersion} · ${mapsWithRule} mapas con regla`}>
                          auditoría v{p.audit.rulesVersion} · {mapsWithRule} mapas
                        </span>
                      ) : (
                        <span className="mini-stats">sin reglas de auditoría</span>
                      )}
                    </div>
                  </div>
                  <div className="profile-card-actions">
                    {p.primary ? (
                      <button className="f-chip player-on" disabled title="Perfil principal (Auditoría y Tienda)">★ Principal</button>
                    ) : (
                      <button
                        className="f-chip"
                        onClick={() => void makePrimary(p)}
                        disabled={busyId === p.id}
                        title="Usar este perfil en Auditoría y Tienda"
                      >
                        Hacer principal
                      </button>
                    )}
                    <button
                      className={`f-chip${p.visible ? ' player-on' : ''}`}
                      onClick={() => void toggleVisible(p)}
                      disabled={busyId === p.id}
                      title="Mostrar u ocultar en Ranked"
                    >
                      {p.visible ? 'Visible' : 'Oculto'}
                    </button>
                    <button className="f-chip" onClick={() => setEditing(p)}>Editar</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {(creating || editing) && (
        <ProfileForm
          profile={editing}
          profiles={profiles}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
