'use client';

import { useQuery } from '@tanstack/react-query';

export interface SessionInfo {
  user: { username: string };
  admin: boolean;
  mustChangePassword?: boolean;
  users?: number;
  mode?: 'single' | 'public';
  riot?: { gameName: string; tagLine: string; mock: boolean } | null;
  consentAt?: number | null;
  publicProfile?: boolean;
}

/** Sesión actual: usuario + flag admin (para permisos de UI). */
export function useSession() {
  return useQuery<SessionInfo>({
    queryKey: ['auth-session'],
    queryFn: async () => {
      const res = await fetch('/api/auth/session');
      if (!res.ok) throw new Error('No autenticado');
      return res.json();
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}
