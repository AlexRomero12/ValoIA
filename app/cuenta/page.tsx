'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/useSession';
import { LocaleSwitch, useT } from '@/lib/i18n/useLocale';

/**
 * Mi cuenta (modo público): vinculación con Riot (RSO/mock), consentimiento y
 * opt-in de perfil público, cambio de contraseña y baja de cuenta.
 */
export default function CuentaPage() {
  const t = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const session = useSession();

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Borradores: null = usar el valor de la sesión (evita setState en efectos).
  const [acceptDraft, setAcceptDraft] = useState<boolean | null>(null);
  const [publicDraft, setPublicDraft] = useState<boolean | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');

  const accept = acceptDraft ?? session.data?.consentAt != null;
  const publicProfile = publicDraft ?? session.data?.publicProfile === true;

  useEffect(() => {
    if (session.isError) router.replace('/login');
  }, [session.isError, router]);

  const refreshSession = async () => {
    await qc.invalidateQueries({ queryKey: ['auth-session'] });
    await qc.invalidateQueries({ queryKey: ['val-profiles'] });
  };

  const linkRiot = async () => {
    if (busy) return;
    setBusy('link');
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/riot/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        setError(json.error || t('account.linkError'));
        return;
      }
      if (json.url) {
        window.location.href = json.url;
        return;
      }
      setNotice(t('account.linked'));
      await refreshSession();
    } finally {
      setBusy(null);
    }
  };

  const unlinkRiot = async () => {
    if (busy) return;
    setBusy('unlink');
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/riot/unlink', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        setError(json.error || t('common.error'));
        return;
      }
      setNotice(t('account.unlinkHelp'));
      await refreshSession();
    } finally {
      setBusy(null);
    }
  };

  const saveConsent = async () => {
    if (busy) return;
    if (!accept) {
      setError(t('account.consentRequired'));
      return;
    }
    setBusy('consent');
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/auth/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accept, publicProfile }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        setError(json.error || t('common.error'));
        return;
      }
      setNotice(t('account.consentSaved'));
      setAcceptDraft(null);
      setPublicDraft(null);
      await refreshSession();
    } finally {
      setBusy(null);
    }
  };

  const changePassword = async () => {
    if (busy) return;
    setBusy('password');
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'password', currentPassword, password: newPassword }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        setError(json.error || t('common.error'));
        return;
      }
      setNotice(t('account.passwordChanged'));
      setCurrentPassword('');
      setNewPassword('');
      qc.clear();
      router.replace('/login');
    } finally {
      setBusy(null);
    }
  };

  const deleteAccount = async () => {
    if (busy) return;
    if (!window.confirm(t('account.deleteConfirm'))) return;
    setBusy('delete');
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/auth/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', password: deletePassword }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        setError(json.error || t('common.error'));
        return;
      }
      qc.clear();
      router.replace('/login');
    } finally {
      setBusy(null);
    }
  };

  const riot = session.data?.riot ?? null;

  return (
    <div className="wrap" style={{ maxWidth: 720, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 0' }}>
        <Link href="/valorant" style={{ textDecoration: 'none', color: 'inherit' }}>
          <b style={{ fontSize: 22 }}>
            Valo<em style={{ color: '#ff4655', fontStyle: 'normal' }}>IA</em>
          </b>
        </Link>
        <LocaleSwitch />
      </header>

      <h2 style={{ marginTop: 0 }}>{t('account.title')}</h2>
      {notice ? <div className="banner warn">{notice}</div> : null}
      {error ? <div className="banner error">{error}</div> : null}

      {/* Riot */}
      <div className="panel" style={{ padding: 18, marginTop: 14 }}>
        <h3 style={{ marginTop: 0 }}>{t('account.riotLink')}</h3>
        {riot ? (
          <>
            <p className="window-info">
              <b>{riot.gameName}#{riot.tagLine}</b> · {t('account.linked')}
              {riot.mock ? ' · demo' : ''}
            </p>
            <button className="f-chip" onClick={() => void unlinkRiot()} disabled={busy === 'unlink'}>
              {t('account.unlink')}
            </button>
          </>
        ) : (
          <>
            <button className="primary-red" onClick={() => void linkRiot()} disabled={busy === 'link'}>
              {busy === 'link' ? t('common.loading') : t('account.link')}
            </button>
            <p className="window-info" style={{ marginTop: 10 }}>
              {t('account.linkHelp')}
            </p>
            <p className="window-info" style={{ marginTop: 6, opacity: 0.8 }}>
              {t('account.mockHelp')}
            </p>
          </>
        )}
      </div>

      {/* Consentimiento */}
      <div className="panel" style={{ padding: 18, marginTop: 14 }}>
        <h3 style={{ marginTop: 0 }}>{t('account.consentTitle')}</h3>
        <p className="window-info">{t('account.consentBody')}</p>
        <label className="pf-check">
          <input type="checkbox" checked={accept} onChange={(e) => setAcceptDraft(e.target.checked)} />
          <span>{t('account.consentAccept')}</span>
        </label>
        <label className="pf-check">
          <input
            type="checkbox"
            checked={publicProfile}
            disabled={!riot}
            onChange={(e) => setPublicDraft(e.target.checked)}
          />
          <span>{t('account.publicProfile')}</span>
        </label>
        <button className="primary-red" onClick={() => void saveConsent()} disabled={busy === 'consent'}>
          {busy === 'consent' ? t('common.loading') : t('account.consentSave')}
        </button>
      </div>

      {/* Contraseña */}
      <div className="panel" style={{ padding: 18, marginTop: 14 }}>
        <h3 style={{ marginTop: 0 }}>{t('account.passwordTitle')}</h3>
        <div style={{ display: 'grid', gap: 10, maxWidth: 360 }}>
          <label className="pf-field">
            <span>{t('account.currentPassword')}</span>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </label>
          <label className="pf-field">
            <span>{t('account.newPassword')}</span>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </label>
          <button className="f-chip" onClick={() => void changePassword()} disabled={busy === 'password'}>
            {t('account.changePassword')}
          </button>
        </div>
      </div>

      {/* Zona de riesgo */}
      <div className="panel" style={{ padding: 18, marginTop: 14, borderColor: '#ff5c69' }}>
        <h3 style={{ marginTop: 0, color: '#ff5c69' }}>{t('account.deleteWarn')}</h3>
        <p className="window-info">{t('account.deleteHelp')}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="password"
            placeholder={t('account.currentPassword')}
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            style={{ maxWidth: 220 }}
          />
          <button className="f-chip" onClick={() => void deleteAccount()} disabled={busy === 'delete'}>
            {t('account.delete')}
          </button>
        </div>
      </div>

      <p className="window-info" style={{ marginTop: 16 }}>
        <Link href="/terms">{t('legal.terms')}</Link> · <Link href="/privacy">{t('legal.privacy')}</Link>
      </p>
    </div>
  );
}
