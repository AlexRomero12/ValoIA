'use client';

import { useQuery } from '@tanstack/react-query';

export interface AimTaskRow {
  taskId: string;
  taskName: string;
  runs: number;
  bestScore: number;
  bestAccuracy: number | null;
  endedAt?: string | null;
  category: string;
  subcategory: string;
  subcategoryColor: string;
  tierName: string;
  rank: string | null;
  rankColor: string;
  nextRank: string | null;
  progress: number | null;
  thresholds: number[];
}

export interface AimDataset {
  profile: {
    username: string;
    rankDisplay: string | null;
    skill: number | null;
    skillScores: { name: string; score: number }[];
  };
  generatedAt: string;
  days: {
    date: string;
    label: string;
    runs: number;
    scenariosPlayed: number;
    tasks: AimTaskRow[];
    byTask: Record<string, AimTaskRow>;
  }[];
  pbs: {
    taskId: string;
    taskName: string;
    category: string;
    subcategory: string;
    bestScore: number | null;
    bestAccuracy: number | null;
    runs: number;
  }[];
  focus: {
    message: string;
    recommended: {
      taskId: string;
      taskName: string;
      category: string;
      subcategory: string;
      bestAccuracy: number | null;
    }[];
  };
}

export function useAimlabData(refresh = false) {
  return useQuery<AimDataset>({
    queryKey: ['aim-data', refresh],
    queryFn: async () => {
      const res = await fetch(`/api/data?days=14${refresh ? '&refresh=1' : ''}`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Error de red');
      return json as AimDataset;
    },
    staleTime: 10 * 60 * 1000,
  });
}
