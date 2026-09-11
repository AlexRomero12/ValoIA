'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ActivityPanel } from './ActivityPanel';
import { RequestsPanel } from './RequestsPanel';
import { SessionsPanel } from './SessionsPanel';

interface UserInfo {
  username: string;
  createdAt: number;
  updatedAt: number;
  admin: boolean;
  mustChangePassword?: boolean;
  createdIp?: string;
}

type Msg = { kind: 'ok' | 'error'; text: string } | null;

/**
 * Mi cuenta / Usuarios + Sesiones.
 * - Admin: crea usuarios (contraseña temporal con cambio forzado), resetea
 *   contraseñas, borra y audita sesiones (todas o por usuario).
 * - Usuario: cambia su propia contraseña (verificando la actual) y ve sus
 *   dispositivos conectados.
 */
export function UsersPanel() {
  const router = useRouter();
  const [tab, setTab] = useState<'users' | 'requests' | 'sessions' | 'activity'>('users');
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [self, setSelf] = useState('');
  const [admin, setAdmin] = useState(false);
  const [mustChange, setMustChange] = useState(false);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [newUser, setNewUser] = useState('');
  const [newPass, setNewPass] = useState('');
  const [forceChange, setForceChange] = useState(true);
  const [pwdFor, setPwdFor] = useState<string | null>(null);
  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwdValue, setPwdValue] = useState('');
  const [pwdRepeat, setPwdRepeat] = useState('');
  const [pwdShow, setPwdShow] = useState(false);
  const [sessionsScope, setSessionsScope] = useState<string>('self');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/auth/users', { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json.error || 'No se pudieron cargar los usuarios');
        if (cancelled) return;
        setUsers(json.users ?? []);
        setSelf(json.self ?? '');
        setAdmin(json.admin === true);
        const mine = (json.users ?? []).find((u: UserInfo) => u.username === json.self) as UserInfo | undefined;
        const params = new URLSearchParams(window.location.search);
        if (mine?.mustChangePassword || params.get('cambiar') === '1') {
          const must = mine?.mustChangePassword === true;
          setMustChange(must);
          setPwdFor(json.self ?? null);
          // Con mustChange el aviso propio ya explica el bloqueo; el mensaje
          // extra solo hace falta si se llegó por ?cambiar=1 sin bloqueo.
          if (!must) setMsg({ kind: 'error', text: 'Cambia tu contraseña para mantener tu cuenta segura.' });
        }
        // Badge de solicitudes pendientes (solo admin).
        if (json.admin === true) {
          const rq = await fetch('/api/auth/requests', { cache: 'no-store' });
          if (rq.ok) {
            const rj = await rq.json();
            if (!cancelled) setPending(rj.pending ?? 0);
          }
        }
      } catch (e) {
        if (!cancelled) setMsg({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const call = async (body: Record<string, unknown>, okText: string): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'No se pudo guardar');
      setUsers(json.users ?? []);
      setSelf(json.self ?? self);
      setMsg({ kind: 'ok', text: okText });
      return true;
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!newUser.trim() || !newPass) return;
    if (await call({ action: 'create', username: newUser.trim(), password: newPass, mustChange: forceChange }, `Usuario ${newUser.trim()} creado`)) {
      setNewUser('');
      setNewPass('');
    }
  };

  const savePassword = async () => {
    const target = pwdFor;
    if (!target || !pwdValue) return;
    if (pwdValue.length < 8) {
      setMsg({ kind: 'error', text: 'La contraseña debe tener al menos 8 caracteres.' });
      return;
    }
    if (pwdValue !== pwdRepeat) {
      setMsg({ kind: 'error', text: 'Las contraseñas no coinciden.' });
      return;
    }
    const ok = await call(
      {
        action: 'password',
        username: target,
        password: pwdValue,
        currentPassword: target === self ? pwdCurrent : undefined,
      },
      target === self ? 'Contraseña actualizada' : `Contraseña de ${target} actualizada`,
    );
    if (ok) {
      setPwdFor(null);
      setPwdCurrent('');
      setPwdValue('');
      setPwdRepeat('');
      setPwdShow(false);
      if (target === self && mustChange) {
        router.replace('/');
        router.refresh();
        return;
      }
    }
  };

  const remove = async (username: string) => {
    if (!window.confirm(`¿Borrar el usuario ${username}? Se cierran sus sesiones.`)) return;
    await call({ action: 'delete', username }, `Usuario ${username} borrado`);
  };

  const openPassword = (username: string) => {
    setPwdFor(pwdFor === username ? null : username);
    setPwdCurrent('');
    setPwdValue('');
    setPwdRepeat('');
    setPwdShow(false);
    setMsg(null);
  };

  const openSessions = (username: string) => {
    setSessionsScope(username);
    setTab('sessions');
  };

  return (
    <div className="panel users-panel" id="mi-cuenta">
      <div className="pf-section-head">
        <h2 style={{ margin: 0 }}>{admin ? 'Administración' : 'Mi cuenta'}</h2>
        <div className="pill-toggle">
          <button className={tab === 'users' ? 'on' : ''} onClick={() => setTab('users')}>
            {admin ? 'Usuarios' : 'Contraseña'}
          </button>
          {admin ? (
            <button className={tab === 'requests' ? 'on' : ''} onClick={() => setTab('requests')}>
              Solicitudes{pending > 0 ? ` (${pending})` : ''}
            </button>
          ) : null}
          <button className={tab === 'sessions' ? 'on' : ''} onClick={() => setTab('sessions')}>
            Sesiones
          </button>
          {admin ? (
            <button className={tab === 'activity' ? 'on' : ''} onClick={() => setTab('activity')}>
              Actividad
            </button>
          ) : null}
        </div>
      </div>

      {mustChange ? (
        <div className="banner warn" style={{ marginTop: 12 }}>
          <div>
            <b>Cuenta bloqueada: cambia tu contraseña para desbloquear el panel.</b>
            <p className="window-info" style={{ margin: '4px 0 0' }}>
              Mientras no la cambies, Ranked, Comparar, Team, Tienda y Auditoría quedan bloqueadas; solo esta
              página está disponible. Usa el formulario de abajo.
            </p>
          </div>
        </div>
      ) : null}
      {msg ? (
        <div className={`banner ${msg.kind === 'error' ? 'error' : 'warn'}`} style={{ marginTop: 12 }}>
          {msg.text}
        </div>
      ) : null}

      {tab === 'users' ? (
        <>
          <p className="window-info" style={{ marginTop: 10 }}>
            {admin
              ? 'Crea usuarios con contraseña temporal (se les pedirá cambiarla al entrar). La contraseña debe tener al menos 8 caracteres.'
              : 'Tu contraseña debe tener al menos 8 caracteres.'}
          </p>

          {loading ? (
            <p className="empty" style={{ marginTop: 12 }}>Cargando…</p>
          ) : (
            <div className="users-list">
              {users.map((u) => (
                <div key={u.username} className={`user-row${pwdFor === u.username ? ' editing' : ''}`}>
                  <div className="user-row-main">
                    <b>{u.username}</b>
                    {u.admin ? <span className="profile-primary-badge">admin</span> : null}
                    {u.username === self ? <span className="profile-primary-badge">tú</span> : null}
                    {u.mustChangePassword ? <span className="audit-warn">debe cambiar contraseña</span> : null}
                    <span className="window-info">desde {new Date(u.createdAt).toLocaleDateString('es')}</span>
                    {admin && u.createdIp ? <span className="window-info">IP {u.createdIp}</span> : null}
                  </div>
                  <div className="user-row-actions">
                    <button
                      className="f-chip"
                      disabled={busy || (mustChange && u.username !== self)}
                      title={mustChange && u.username !== self ? 'Bloqueado: cambia tu contraseña para usar esta acción' : undefined}
                      onClick={() => openPassword(u.username)}
                    >
                      {pwdFor === u.username ? 'Cancelar' : 'Cambiar contraseña'}
                    </button>
                    {admin ? (
                      <button className="f-chip" disabled={busy} onClick={() => openSessions(u.username)}>
                        Sesiones
                      </button>
                    ) : null}
                    {admin ? (
                      <button
                        className="f-chip"
                        disabled={busy || u.username === self || mustChange}
                        title={
                          u.username === self
                            ? 'No puedes borrar tu propio usuario'
                            : mustChange
                              ? 'Bloqueado: cambia tu contraseña para usar esta acción'
                              : undefined
                        }
                        onClick={() => void remove(u.username)}
                      >
                        Borrar
                      </button>
                    ) : null}
                  </div>
                  {pwdFor === u.username ? (
                    <div className="pf-inline" style={{ width: '100%', flexWrap: 'wrap' }}>
                      {u.username === self ? (
                        <input
                          type={pwdShow ? 'text' : 'password'}
                          placeholder="Contraseña actual"
                          autoComplete="current-password"
                          value={pwdCurrent}
                          onChange={(e) => setPwdCurrent(e.target.value)}
                        />
                      ) : (
                        <span className="window-info" style={{ alignSelf: 'center' }}>
                          Reset como admin (se forzará el cambio al entrar)
                        </span>
                      )}
                      <input
                        id={u.username === self ? 'pwd-nueva' : undefined}
                        type={pwdShow ? 'text' : 'password'}
                        className="grow"
                        placeholder="Nueva contraseña"
                        autoComplete="new-password"
                        value={pwdValue}
                        onChange={(e) => setPwdValue(e.target.value)}
                      />
                      <input
                        type={pwdShow ? 'text' : 'password'}
                        className="grow"
                        placeholder="Repite la nueva"
                        autoComplete="new-password"
                        value={pwdRepeat}
                        onChange={(e) => setPwdRepeat(e.target.value)}
                      />
                      <button
                        type="button"
                        className="pw-btn"
                        onClick={() => setPwdShow((v) => !v)}
                        aria-label={pwdShow ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
                      >
                        {pwdShow ? 'Ocultar' : 'Ver'}
                      </button>
                      <button
                        className="primary-red"
                        disabled={busy || pwdValue.length < 8 || pwdValue !== pwdRepeat || (u.username === self && !pwdCurrent)}
                        onClick={() => void savePassword()}
                      >
                        Guardar
                      </button>
                      <p className="window-info" style={{ width: '100%', margin: 0 }}>
                        Mínimo 8 caracteres; mejor una frase fácil de recordar (12+).
                        {pwdRepeat && pwdValue !== pwdRepeat ? <b className="stat-loss"> Las contraseñas no coinciden.</b> : null}
                      </p>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          {admin ? (
            <div className="users-create">
              <label className="pf-field">
                <span>Nuevo usuario</span>
                <input value={newUser} onChange={(e) => setNewUser(e.target.value)} placeholder="nombre" autoComplete="off" spellCheck={false} />
              </label>
              <label className="pf-field">
                <span>Contraseña temporal</span>
                <input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="mín. 8 caracteres" autoComplete="new-password" />
              </label>
              <button
                className="primary-red"
                disabled={busy || mustChange || !newUser.trim() || newPass.length < 8}
                title={mustChange ? 'Bloqueado: cambia tu contraseña para usar esta acción' : undefined}
                onClick={() => void create()}
              >
                Crear usuario
              </button>
              <label className="rule-field check" style={{ gridColumn: '1 / -1' }}>
                <input type="checkbox" checked={forceChange} onChange={(e) => setForceChange(e.target.checked)} />
                <span>Pedir cambio de contraseña al primer login</span>
              </label>
            </div>
          ) : null}
        </>
      ) : tab === 'requests' ? (
        <RequestsPanel onPending={setPending} />
      ) : tab === 'activity' ? (
        <ActivityPanel />
      ) : (
        <>
          {admin ? (
            <div className="controls" style={{ marginTop: 10 }}>
              <label>Ver</label>
              <select value={sessionsScope} onChange={(e) => setSessionsScope(e.target.value)}>
                <option value="self">Mis sesiones</option>
                <option value="all">Todas</option>
                {users.map((u) => (
                  <option key={u.username} value={u.username}>
                    {u.username}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <SessionsPanel scope={sessionsScope} admin={admin} onPickUser={setSessionsScope} />
        </>
      )}
    </div>
  );
}
