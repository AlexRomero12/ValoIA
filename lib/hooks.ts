'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ValStatus, ValSummary, AgentIconInfo } from './types';
import type { MatchDetail } from './matchDetail';
import type { Profile, AuditRules } from './profileTypes';
import { useCooldown } from './useCooldown';

export type ValWindowMode =
  | { kind: 'season' }
  | { kind: 'days'; days: number };

export const DEFAULT_LIMIT = 10;
export const LIMIT_STEPS = [10, 20, 40] as const;
export const MAX_LIMIT = 40;

export function nextLimit(current: number): number | null {
  const next = LIMIT_STEPS.find((s) => s > current);
  return next ?? null;
}

export function summaryUrl(mode: ValWindowMode, playerId: string, limit: number, refresh = false): string {
  const qs = mode.kind === 'season' ? 'season=current' : `days=${mode.days}`;
  return `/api/valorant/summary?${qs}&limit=${limit}&player=${encodeURIComponent(playerId)}${refresh ? '&refresh=1' : ''}`;
}

export function useValSummary(mode: ValWindowMode, playerId: string, limit = DEFAULT_LIMIT, enabled = true) {
  const url = summaryUrl(mode, playerId, limit);
  return useQuery<ValSummary & { error?: string; code?: string }>({
    queryKey: ['val-summary', url],
    queryFn: async () => {
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok || json.error) {
        throw Object.assign(new Error(json.error || 'Error de red'), { code: json.code });
      }
      return json;
    },
    staleTime: 10 * 60 * 1000,
    enabled,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const POLL_MS = 3_000;
const POLL_TIMEOUT_MS = 60_000;

/**
 * Refresco SWR: dispara POST /api/valorant/refresh (trabajo en segundo plano)
 * y sondea el summary interno (coste $0 de Henrik) comparando syncedAt
 * hasta que la revalidación del servidor termina.
 */
export function useBackgroundRefresh(opts: {
  /** URL del GET summary del jugador (para el sondeo) */
  summaryUrl: string;
  /** Último syncedAt conocido (window.syncedAt) */
  getSyncedAt: () => string | null | undefined;
  /** Último mmrSyncedAt conocido (window.mmrSyncedAt): sin él, un refresh de
   *  solo-MMR nunca "confirmaba" porque syncedAt (bucket) no se movía. */
  getMmrSyncedAt?: () => string | null | undefined;
  refetch: () => Promise<unknown>;
}) {
  const cooldown = useCooldown(15);
  const [refreshing, setRefreshing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const trigger = async () => {
    if (refreshing || cooldown.locked) return;
    setRefreshing(true);
    setLastError(null);
    try {
      const url = opts.summaryUrl;
      const refreshUrl = `${url.replace('/summary?', '/refresh?')}&scope=all`;
      const res = await fetch(refreshUrl, { method: 'POST' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string })?.error || 'No se pudo iniciar la actualización');
      }

      const beforeSynced = opts.getSyncedAt();
      const beforeMmr = opts.getMmrSyncedAt?.();
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      let done = false;
      let sawSynced = beforeSynced != null;

      while (!done && Date.now() < deadline) {
        await sleep(POLL_MS);
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) continue;
        const json = (await r.json().catch(() => null)) as ({ window?: { syncedAt?: string | null; mmrSyncedAt?: string | null } } | null);
        const synced = json?.window?.syncedAt ?? null;
        const mmrSynced = json?.window?.mmrSyncedAt ?? null;
        if (synced != null) {
          sawSynced = true;
          done = synced !== beforeSynced || mmrSynced !== beforeMmr;
        } else if (!sawSynced) {
          // Proveedor sin syncedAt (Riot): el primer GET tras la invalidación
          // ya es la respuesta fresca.
          done = true;
        }
        // Con syncedAt pero sin cambios: seguimos sondeando
        if (done && synced != null) break;
      }

      if (done) {
        await opts.refetch();
      } else {
        setLastError('El servidor no confirmó la actualización a tiempo (si nada cambió, está bien).');
      }
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
      cooldown.trigger();
    }
  };

  return { refreshing, trigger, locked: cooldown.locked, lastError };
}

export function useValStatus() {
  return useQuery<ValStatus>({
    queryKey: ['val-status'],
    queryFn: async () => {
      const res = await fetch('/api/valorant/status');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useAgentIcons() {
  return useQuery<AgentIconInfo[]>({
    queryKey: ['val-agents'],
    queryFn: async () => {
      const res = await fetch('/api/valorant/agents');
      if (!res.ok) throw new Error('No se pudo cargar el catálogo de agentes');
      return res.json();
    },
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}

export function agentIconLookup(list: AgentIconInfo[] | undefined): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const a of list ?? []) map.set(a.name.toLowerCase(), a.icon);
  return map;
}

export function useMatchDetail(matchId: string | null, playerId?: string) {
  return useQuery<MatchDetail & { error?: string; code?: string }>({
    queryKey: ['val-detail', matchId, playerId ?? ''],
    queryFn: async () => {
      const p = playerId ? `&player=${encodeURIComponent(playerId)}` : '';
      const res = await fetch(`/api/valorant/match?id=${encodeURIComponent(matchId!)}${p}`);
      const json = await res.json();
      if (!res.ok || json.error) throw Object.assign(new Error(json.error || 'Error de red'), { code: json.code });
      return json;
    },
    enabled: Boolean(matchId),
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  });
}

export function useTierIcons() {
  return useQuery<Record<string, string>>({
    queryKey: ['val-tier-icons'],
    queryFn: async () => {
      const res = await fetch('/api/valorant/tiers');
      if (!res.ok) throw new Error('No se pudieron cargar los iconos de rango');
      const json = (await res.json()) as { icons?: Record<string, string> };
      return json.icons ?? {};
    },
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
  });
}

// ---------- Perfiles ----------

export const PROFILES_KEY = ['val-profiles'] as const;

export function useProfiles() {
  return useQuery<Profile[]>({
    queryKey: PROFILES_KEY,
    queryFn: async () => {
      const res = await fetch('/api/valorant/profiles');
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'No se pudieron cargar los perfiles');
      return (json.profiles ?? []) as Profile[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export interface ProfileMutation {
  /** true si guardó/borró; error si falló */
  ok: boolean;
  error?: string;
  profiles?: Profile[];
}

export type ProfileInput = Omit<Partial<Profile>, 'audit'> & { name: string; tag: string; audit?: AuditRules | null };

/** Acciones de perfiles contra la API + invalidación de la caché local. */
export function useProfileActions() {
  const client = useQueryClient();

  const upsert = async (profile: ProfileInput): Promise<ProfileMutation> => {
    const res = await fetch('/api/valorant/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upsert', profile }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) return { ok: false, error: (json as { error?: string }).error || 'No se pudo guardar el perfil' };
    const profiles = (json.profiles ?? []) as Profile[];
    client.setQueryData(PROFILES_KEY, profiles);
    return { ok: true, profiles };
  };

  const remove = async (id: string): Promise<ProfileMutation> => {
    const res = await fetch('/api/valorant/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) return { ok: false, error: (json as { error?: string }).error || 'No se pudo borrar el perfil' };
    const profiles = (json.profiles ?? []) as Profile[];
    client.setQueryData(PROFILES_KEY, profiles);
    return { ok: true, profiles };
  };

  return { upsert, remove };
}
