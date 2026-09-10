'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ValSummary, AgentIconInfo } from './types';
import type { MatchDetail } from './matchDetail';
import type { Profile, AuditRules } from './profileTypes';

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
