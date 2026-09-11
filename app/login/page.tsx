'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/** Solo rutas internas válidas (anti open-redirect: //, \, URLs absolutas). */
function safeNext(raw: string | null): string {
  if (!raw) return '/';
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/';
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<'login' | 'request'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reqUser, setReqUser] = useState('');
  const [reqMsg, setReqMsg] = useState('');
  const [reqBusy, setReqBusy] = useState(false);
  const [reqError, setReqError] = useState<string | null>(null);
  /** Usuario enviado: si existe, mostramos el estado "pendiente de aprobación". */
  const [reqSentFor, setReqSentFor] = useState<string | null>(null);

  const submitRequest = async (e: FormEvent) => {
    e.preventDefault();
    if (reqBusy || !reqUser.trim()) return;
    setReqBusy(true);
    setReqError(null);
    try {
      const res = await fetch('/api/auth/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: reqUser.trim(), message: reqMsg.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || json.error) throw new Error(json.error || 'No se pudo enviar la solicitud');
      setReqSentFor(reqUser.trim().toLowerCase());
      setReqUser('');
      setReqMsg('');
    } catch (err) {
      setReqError(err instanceof Error ? err.message : String(err));
    } finally {
      setReqBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !username.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; mustChangePassword?: boolean };
      if (!res.ok || json.error) throw new Error(json.error || 'No se pudo entrar');
      if (json.mustChangePassword) {
        router.replace('/perfiles?cambiar=1');
        router.refresh();
        return;
      }
      router.replace(safeNext(params.get('next')));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const backToLogin = () => {
    setMode('login');
    setError(null);
    setReqError(null);
    setReqSentFor(null);
  };

  return (
    <div className="login-wrap">
      <div className="panel login-card">
        <h1 className="login-brand">
          Valo<em>IA</em>
        </h1>
        <p className="login-sub">{mode === 'login' ? 'Tu panel de rendimiento Valorant' : 'Solicitar acceso'}</p>

        {mode === 'login' ? (
          <form className="login-form" onSubmit={submit}>
            <label className="login-field">
              <span>Usuario</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                spellCheck={false}
              />
            </label>

            <label className="login-field">
              <span>Contraseña</span>
              <div className="login-pw">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="pw-btn"
                  onClick={() => setShowPass((v) => !v)}
                  aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPass ? 'Ocultar' : 'Ver'}
                </button>
              </div>
            </label>

            <p className="login-hint">¿Olvidaste tu contraseña? Pídele al administrador que la restablezca.</p>

            {error ? (
              <>
                <div className="banner error">{error}</div>
                <p className="login-hint">
                  Si aún no te aprobaron, tu solicitud sigue pendiente en Perfiles → Solicitudes.
                </p>
              </>
            ) : null}

            <button className="primary-red login-btn" disabled={busy || !username.trim() || !password}>
              Entrar{busy ? <span className="loader" /> : null}
            </button>
            <button
              type="button"
              className="f-chip login-switch"
              onClick={() => {
                setMode('request');
                setError(null);
              }}
            >
              ¿No tienes cuenta? Solicitar acceso
            </button>
          </form>
        ) : reqSentFor ? (
          <div className="login-pending">
            <b>Solicitud enviada</b>
            <p>
              El usuario <b>{reqSentFor}</b> queda pendiente de aprobación. El administrador la verá en
              Perfiles → Solicitudes; no enviamos correos, así que te avisará por fuera de la app.
            </p>
            <p>
              Cuando la apruebe, entra con la contraseña temporal que te comparta y cámbiala en tu primer acceso.
            </p>
            <button type="button" className="f-chip login-switch" onClick={backToLogin}>
              Volver al login
            </button>
          </div>
        ) : (
          <form className="login-form" onSubmit={submitRequest}>
            <ol className="login-steps">
              <li>Envías el usuario que quieres.</li>
              <li>El administrador aprueba la solicitud.</li>
              <li>Te comparte una contraseña temporal; al entrar te pediremos cambiarla.</li>
            </ol>

            <label className="login-field">
              <span>Usuario que quieres</span>
              <input
                value={reqUser}
                onChange={(e) => setReqUser(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <p className="login-hint">2-32 caracteres: letras, números, punto, guion y guion bajo.</p>

            <label className="login-field">
              <span>Mensaje (opcional)</span>
              <input
                value={reqMsg}
                onChange={(e) => setReqMsg(e.target.value)}
                placeholder="Quién eres o para qué"
                autoComplete="off"
              />
            </label>

            {reqError ? <div className="banner error">{reqError}</div> : null}

            <button className="primary-red login-btn" disabled={reqBusy || !reqUser.trim()}>
              Enviar solicitud{reqBusy ? <span className="loader" /> : null}
            </button>
            <button type="button" className="f-chip login-switch" onClick={backToLogin}>
              Volver al login
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="login-wrap">
          <div className="panel login-card">
            <p className="empty">Cargando…</p>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
