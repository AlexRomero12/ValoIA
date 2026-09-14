'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { LocaleSwitch, useT } from '@/lib/i18n/useLocale';

/** Solo rutas internas válidas (anti open-redirect: //, \, URLs absolutas). */
function safeNext(raw: string | null): string {
  if (!raw) return '/valorant';
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/valorant';
  try {
    const url = new URL(raw, 'http://x');
    return url.protocol === 'http:' ? url.pathname + url.search : '/valorant';
  } catch {
    return '/valorant';
  }
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState<'login' | 'register'>(params.get('tab') === 'register' ? 'register' : 'login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (tab === 'register' && password !== password2) {
      setError(t('auth.err.mismatch'));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(tab === 'login' ? '/api/auth/login' : '/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        setError(json.error || (res.status === 401 ? t('auth.err.invalid') : t('auth.err.generic')));
        return;
      }
      router.replace(safeNext(params.get('next')));
      router.refresh();
    } catch {
      setError(t('auth.err.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wrap" style={{ maxWidth: 460, margin: '8vh auto 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
          <b style={{ fontSize: 22 }}>
            Valo<em style={{ color: '#ff4655', fontStyle: 'normal' }}>IA</em>
          </b>
        </Link>
        <LocaleSwitch />
      </div>

      <div className="panel" style={{ padding: 22 }}>
        <div className="tabs" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button className={`f-chip${tab === 'login' ? ' player-on' : ''}`} onClick={() => setTab('login')} type="button">
            {t('auth.login')}
          </button>
          <button className={`f-chip${tab === 'register' ? ' player-on' : ''}`} onClick={() => setTab('register')} type="button">
            {t('auth.register')}
          </button>
        </div>

        <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
          <label className="pf-field">
            <span>{t('auth.username')}</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required minLength={2} maxLength={32} />
          </label>
          <label className="pf-field">
            <span>{t('auth.password')}</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={tab === 'login' ? 'current-password' : 'new-password'} required minLength={8} maxLength={128} />
          </label>
          {tab === 'register' ? (
            <label className="pf-field">
              <span>{t('auth.password2')}</span>
              <input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" required minLength={8} maxLength={128} />
            </label>
          ) : null}

          {error ? <div className="banner error">{error}</div> : null}

          <button className="primary-red" type="submit" disabled={busy}>
            {busy ? t('common.loading') : tab === 'login' ? t('auth.submitLogin') : t('auth.submitRegister')}
          </button>
        </form>

        <p className="window-info" style={{ marginTop: 14 }}>
          {tab === 'login' ? (
            <button className="linklike" type="button" onClick={() => setTab('register')}>{t('auth.noAccount')}</button>
          ) : (
            <button className="linklike" type="button" onClick={() => setTab('login')}>{t('auth.haveAccount')}</button>
          )}
        </p>
      </div>

      <p className="window-info" style={{ marginTop: 14, textAlign: 'center' }}>
        <Link href="/terms">{t('legal.terms')}</Link> · <Link href="/privacy">{t('legal.privacy')}</Link>
      </p>
      <p className="window-info" style={{ textAlign: 'center', opacity: 0.7 }}>{t('landing.notAffiliated')}</p>
    </div>
  );
}
