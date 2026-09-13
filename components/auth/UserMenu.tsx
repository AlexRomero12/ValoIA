'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/useSession';

/**
 * Usuario conectado + salir. Vive en el TopBar de todas las páginas.
 * Silencioso si no hay sesión (p. ej. en /login no se monta).
 */
export function UserMenu() {
  const router = useRouter();
  const qc = useQueryClient();
  const q = useSession();

  if (!q.data) return null;

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    qc.clear();
    router.replace('/login');
    router.refresh();
  };

  return (
    <span className="user-menu">
      <span className="user-chip" title={q.data.admin ? 'Administrador' : 'Sesión iniciada'}>
        {q.data.user.username}
        {q.data.admin ? ' ★' : ''}
      </span>
      <button className="f-chip" onClick={() => void logout()} title="Cerrar sesión">
        Salir
      </button>
    </span>
  );
}
