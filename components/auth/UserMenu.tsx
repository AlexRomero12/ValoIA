'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/useSession';
import { useT } from '@/lib/i18n/useLocale';

/**
 * Usuario conectado + salir. Vive en el TopBar de todas las páginas; en la
 * instancia personal (modo single) no se muestra.
 */
export function UserMenu() {
  const router = useRouter();
  const qc = useQueryClient();
  const q = useSession();
  const t = useT();

  if (!q.data || q.data.mode === 'single') return null;

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    qc.clear();
    router.replace('/login');
    router.refresh();
  };

  return (
    <span className="user-menu" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Link className="user-chip" href="/cuenta" title={t('auth.menu.profile')}>
        {q.data.user.username}
        {q.data.admin ? ' ★' : ''}
        {q.data.riot ? ` · ${q.data.riot.gameName}` : ''}
      </Link>
      <button className="f-chip" onClick={() => void logout()} title={t('auth.logout')}>
        {t('auth.logout')}
      </button>
    </span>
  );
}
