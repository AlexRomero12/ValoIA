'use client';

import { useRef, useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { ProfileForm } from '@/components/profiles/ProfileForm';
import { UsersPanel } from '@/components/auth/UsersPanel';
import { useProfileActions, useProfiles } from '@/lib/hooks';
import { useSession } from '@/lib/useSession';
import { profileColor, memberAccounts, type Profile } from '@/lib/profileTypes';
import { buildTransferFile, exportFileName, parseTransferFile } from '@/lib/profileTransfer';

export default function PerfilesPage() {
  const profilesQ = useProfiles();
  const actions = useProfileActions();
  const session = useSession();
  const [editing, setEditing] = useState<Profile | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  const profiles = profilesQ.data ?? [];
  /** Contraseña temporal pendiente: el proxy bloquea todo excepto esta página. */
  const mustChange = session.data?.mustChangePassword === true;
  const selfUser = session.data?.user.username;
  /** Solo se exportan perfiles propios (cada usuario ve únicamente los suyos). */
  const mine = (p: Profile) => !p.owner || p.owner === selfUser;

  const downloadProfiles = (list: Profile[], name: string) => {
    const blob = new Blob([buildTransferFile(list)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAll = () => {
    const own = profiles.filter(mine);
    if (!own.length) return;
    downloadProfiles(own, 'valoia-perfiles.valoia.json');
  };

  const exportOne = (p: Profile) => downloadProfiles([p], exportFileName(p.label));

  const importFile = async (file: File) => {
    if (importBusy || mustChange) return;
    const parsed = parseTransferFile(await file.text());
    if ('error' in parsed) {
      setError(parsed.error);
      setImportMsg(null);
      return;
    }
    setImportBusy(true);
    setError(null);
    setImportMsg(null);
    let ok = 0;
    const failures: string[] = [];
    for (const p of parsed.profiles) {
      const res = await actions.upsert({
        label: p.label,
        name: p.name,
        tag: p.tag,
        role: p.role,
        color: p.color,
        visible: p.visible,
        ...(p.primary ? { primary: true } : {}),
        accounts: p.accounts,
        prefs: p.prefs,
        audit: p.audit,
      });
      if (res.ok) ok += 1;
      else failures.push(`${p.label}: ${res.error ?? 'error'}`);
    }
    setImportBusy(false);
    setImportMsg(
      ok
        ? `Importados ${ok} perfil(es).${failures.length ? ` Con errores: ${failures.join(' · ')}` : ''}`
        : `No se importó ninguno. ${failures.join(' · ')}`,
    );
  };

  /** Baja al formulario de contraseña y lo enfoca (el ancla # no bastaba). */
  const goToPassword = () => {
    document.getElementById('mi-cuenta')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => {
      document.getElementById('pwd-nueva')?.focus({ preventScroll: true });
    }, 350);
  };

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
        disabled={mustChange}
        disabledReason={mustChange ? 'Bloqueado hasta cambiar la contraseña' : undefined}
        activePage="perfiles"
      />

      <LoadingOverlay
        open={profilesQ.isLoading}
        title="Cargando perfiles"
        message="Leyendo data/profiles.json"
        blocking
      />

      {mustChange ? (
        <div className="banner warn locked-banner">
          <b>Cambia tu contraseña para desbloquear el panel.</b>
          <span>
            Hasta que la cambies, <b>todo está bloqueado</b>: Ranked, Comparar, Team, Tienda y Auditoría.
            Solo esta página está disponible.
          </span>
          <button type="button" className="f-chip" onClick={goToPassword}>Cambiar contraseña ahora</button>
        </div>
      ) : null}

      {error ? <div className="banner error">{error}</div> : null}
      {profilesQ.error ? <div className="banner error">{(profilesQ.error as Error).message}</div> : null}

      <div className="panel" style={{ marginTop: 20 }}>
        <div className="pf-section-head">
          <h2 style={{ margin: 0 }}>Perfiles</h2>
          <div className="profile-tools">
            <input
              ref={importInput}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.target.value = '';
              }}
            />
            <button
              className="f-chip"
              disabled={mustChange || importBusy}
              title={mustChange ? 'Bloqueado: cambia tu contraseña para usar esta acción' : 'Importar perfiles desde un archivo .valoia.json'}
              onClick={() => importInput.current?.click()}
            >
              {importBusy ? 'Importando…' : 'Importar'}
            </button>
            <button
              className="f-chip"
              disabled={!profiles.filter(mine).length}
              title="Descargar tus perfiles en un archivo .valoia.json"
              onClick={exportAll}
            >
              Exportar
            </button>
            <button
              className="primary-red"
              disabled={mustChange}
              title={mustChange ? 'Bloqueado: cambia tu contraseña para usar esta acción' : undefined}
              onClick={() => setCreating(true)}
            >
              + Nuevo perfil
            </button>
          </div>
        </div>
        <p className="window-info" style={{ marginTop: 8 }}>
          Elige el <b>perfil principal</b> (★): es el único que se audita. Los <b>visibles</b> aparecen en Ranked;
          Comparar y Team pueden usar cualquiera de tus perfiles. Exportar/Importar solo incluye la configuración de
          tus perfiles (nunca RSO ni notas).
        </p>
        {importMsg ? <p className="banner warn" style={{ marginTop: 10 }}>{importMsg}</p> : null}

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
                        disabled={busyId === p.id || mustChange}
                        title={mustChange ? 'Bloqueado: cambia tu contraseña para usar esta acción' : 'Usar este perfil en Auditoría y Tienda'}
                      >
                        Hacer principal
                      </button>
                    )}
                    <button
                      className={`f-chip${p.visible ? ' player-on' : ''}`}
                      onClick={() => void toggleVisible(p)}
                      disabled={busyId === p.id || mustChange}
                      title={mustChange ? 'Bloqueado: cambia tu contraseña para usar esta acción' : 'Mostrar u ocultar en Ranked'}
                    >
                      {p.visible ? 'Visible' : 'Oculto'}
                    </button>
                    <button
                      className="f-chip"
                      disabled={mustChange}
                      title={mustChange ? 'Bloqueado: cambia tu contraseña para usar esta acción' : undefined}
                      onClick={() => setEditing(p)}
                    >
                      Editar
                    </button>
                    {mine(p) ? (
                      <button className="f-chip" onClick={() => exportOne(p)} title="Exportar este perfil a un archivo">
                        Exportar
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <UsersPanel />

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
