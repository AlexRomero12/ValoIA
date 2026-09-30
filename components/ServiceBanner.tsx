'use client';

import { useQuery } from '@tanstack/react-query';
import type { ServiceStatus } from '@/lib/serviceStatus';

/**
 * Aviso global cuando Riot reporta mantenimiento o incidencias. Evita el ruido
 * de errores genéricos ("henrikdev HTTP 500") dando contexto: si es Riot, se
 * muestra el histórico local mientras tanto (ver lib/valorant.ts).
 */
export function ServiceBanner() {
  const { data } = useQuery<ServiceStatus>({
    queryKey: ['service-status'],
    queryFn: async () => {
      const res = await fetch('/api/valorant/service-status');
      if (!res.ok) throw new Error('No se pudo consultar el estado de Riot');
      return (await res.json()) as ServiceStatus;
    },
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: false,
  });

  if (!data?.degraded) return null;

  const first = data.incidents[0];
  const label = data.maintenance
    ? 'Riot en mantenimiento — se muestra el histórico local'
    : 'Riot reporta incidencias — los datos pueden estar incompletos';

  return (
    <div className="banner warn" title={first?.message ?? undefined}>
      {label}
      {first?.title ? ` · ${first.title}` : ''}
    </div>
  );
}
