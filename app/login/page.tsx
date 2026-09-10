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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reqUser, setReqUser] = useState('');
  const [reqMsg, setReqMsg] = useState('');
  const [reqBusy, setReqBusy] = useState(false);
  const [reqError, setReqError] = useState<string | null>(null);
  const [reqInfo, setReqInfo] = useState<string | null>(null);

  const submitRequest = async (e: FormEvent) => {
    e.preventDefault();
    if (reqBusy || !reqUser.trim()) return;
    setReqBusy(true);
    setReqError(null);
    setReqInfo(null);
    try {
      const res = await fetch('/api/auth/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: reqUser.trim(), message: reqMsg.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok || json.error) throw new Error(json.error || 'No se pudo enviar la solicitud');
      setReqInfo(json.message ?? 'Solicitud enviada. El administrador la revisará.');
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

  return (
    <div className="login-wrap">
      <form className="panel login-card" onSubmit={mode === 'login' ? submit : submitRequest}>
        <h1 className="login-brand">
          Valo<em>IA</em>
        </h1>
        <p className="login-sub">{mode === 'login' ? 'Acceso restringido' : 'Solicitar acceso'}</p>

        {mode === 'login' ? (
          <>
            <label className="login-field">
              <span>Usuario</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                spellCheck={false}
              />
            </label>

            <label className="login-field">
              <span>Contraseña</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>

            {error ? <div className="banner error">{error}</div> : null}

            <button className="primary-red login-btn" disabled={busy || !username.trim() || !password}>
              Entrar{busy ? <span className="loader" /> : null}
            </button>
            <button
              type="button"
              className="f-chip"
              style={{ justifyContent: 'center' }}
              onClick={() => {
                setMode('request');
                setError(null);
                setReqInfo(null);
              }}
            >
              ¿No tienes cuenta? Solicitar acceso
            </button>
          </>
        ) : (
          <>
            <label className="login-field">
              <span>Usuario que quieres</span>
              <input
                value={reqUser}
                onChange={(e) => setReqUser(e.target.value)}
                autoComplete="off"
                autoFocus
                spellCheck={false}
              />
            </label>

            <label className="login-field">
              <span>Mensaje (opcional)</span>
              <input
                value={reqMsg}
                onChange={(e) => setReqMsg(e.target.value)}
                placeholder="Quién eres / para qué"
                autoComplete="off"
              />
            </label>

            {reqError ? <div className="banner error">{reqError}</div> : null}
            {reqInfo ? <div className="banner warn">{reqInfo}</div> : null}

            <button className="primary-red login-btn" disabled={reqBusy || !reqUser.trim()}>
              Enviar solicitud{reqBusy ? <span className="loader" /> : null}
            </button>
            <button
              type="button"
              className="f-chip"
              style={{ justifyContent: 'center' }}
              onClick={() => {
                setMode('login');
                setReqError(null);
                setReqInfo(null);
              }}
            >
              Volver al login
            </button>
          </>
        )}
      </form>
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
