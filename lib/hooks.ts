'use client';

import { useQuery } from '@tanstack/react-query';
import type { ValStatus, ValSummary, AgentIconInfo } from './types';
import type { MatchDetail } from './matchDetail';

export type ValWindowMode =
  | { kind: 'season' }
  | { kind: 'days'; days: number };

export function summaryUrl(mode: ValWindowMode, playerId: string, refresh = false): string {
  const qs = mode.kind === 'season' ? 'season=current&limit=40' : `days=${mode.days}`;
  return `/api/valorant/summary?${qs}&player=${encodeURIComponent(playerId)}${refresh ? '&refresh=1' : ''}`;
}

export function useValSummary(mode: ValWindowMode, playerId: string, refresh = false) {
  const url = summaryUrl(mode, playerId, refresh);
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
  });
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
