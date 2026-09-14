'use client';

import { useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { ProfileForm } from '@/components/profiles/ProfileForm';
import { useOwnProfiles } from '@/lib/hooks';
import { profileColor, memberAccounts, type Profile } from '@/lib/profileTypes';

/**
 * Ajustes del perfil único (single-user): Riot ID, rol, cuentas alternativas,
 * preferencias de agente por mapa y reglas de sesión.
 */
export default function PerfilesPage() {
  const profilesQ = useOwnProfiles();
  const [editing, setEditing] = useState<Profile | null>(null);

  const profiles = profilesQ.data ?? [];
  const profile = profiles[0];

  return (
    <div className="wrap">
      <TopBar
        accent="red"
        title="Perfil"
        subtitle={['Cuenta única', 'Config']}
        chip={<span className="chip-red">{profile ? `${profile.name}#${profile.tag}` : 'sin perfil'}</span>}
        updated={null}
        onRefresh={() => void profilesQ.refetch()}
        loading={profilesQ.isFetching}
        activePage="perfiles"
      />

      <LoadingOverlay
        open={profilesQ.isLoading}
        title="Cargando perfil"
        message="Leyendo data/profiles.json"
        blocking
      />

      {profilesQ.error ? <div className="banner error">{(profilesQ.error as Error).message}</div> : null}

      <div className="panel" style={{ marginTop: 20 }}>
        <div className="pf-section-head">
          <h2 style={{ margin: 0 }}>Perfil</h2>
          <div className="profile-tools">
            <button className="primary-red" disabled={!profile} onClick={() => profile && setEditing(profile)}>
              Editar
            </button>
          </div>
        </div>
        <p className="window-info" style={{ marginTop: 8 }}>
          Esta rama es <b>single-user</b>: un único perfil de Riot consultado con la API oficial (dev + mock).
          Aquí ajustas tu Riot ID, rol, cuentas alternativas, preferencias de agente por mapa y reglas de sesión.
        </p>

        {!profile && !profilesQ.isLoading ? (
          <p className="empty" style={{ marginTop: 16 }}>Sin perfil: revisa VAL_NAME/VAL_TAG en el .env.</p>
        ) : null}

        {profile ? (
          <div className="profiles-list">
            {(() => {
              const color = profileColor(profile, 0);
              const accs = memberAccounts(profile);
              const mapsWithRule = profile.rules ? Object.keys(profile.rules.pool.byMap).length : 0;
              return (
                <div className="profile-card primary" style={{ ['--pc' as string]: color }}>
                  <span className="profile-card-dot" />
                  <div className="profile-card-main">
                    <div className="profile-card-title">
                      <b>{profile.label}</b>
                      <span className="profile-primary-badge">★ Principal</span>
                      <span className="window-info">{profile.name}#{profile.tag}</span>
                      {profile.role ? <span className="profile-role">{profile.role}</span> : null}
                    </div>
                    <div className="profile-card-meta">
                      {accs.length > 1 ? <span className="mini-stats">{accs.length} cuentas</span> : null}
                      {profile.rules ? (
                        <span className="mini-stats" title={`rules v${profile.rules.rulesVersion} · ${mapsWithRule} mapas con regla`}>
                          reglas v{profile.rules.rulesVersion} · {mapsWithRule} mapas
                        </span>
                      ) : (
                        <span className="mini-stats">sin reglas de sesión</span>
                      )}
                    </div>
                  </div>
                  <div className="profile-card-actions">
                    <button className="f-chip" onClick={() => setEditing(profile)}>Editar</button>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : null}
      </div>

      {editing ? (
        <ProfileForm
          profile={editing}
          profiles={[]}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
