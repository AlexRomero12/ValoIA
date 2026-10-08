'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { TopBar } from '@/components/TopBar';
import { EquipoTabs, type EquipoTab } from '@/components/team/EquipoTabs';
import { PremierTab } from '@/components/team/PremierTab';
import { useProfiles, usePremier } from '@/lib/hooks';

/**
 * Pestaña Premier del hub Equipo: equipo real de Premier (roster, resultados y
 * temporadas) tal como lo publica Riot vía `/valorant/v2/premier`.
 *
 * El equipo se consulta por la cuenta principal del perfil elegido; el endpoint
 * del servidor resuelve los nombres de los miembros y cachea 6 h.
 */
export function PremierPage({ tab, onTab }: { tab: EquipoTab; onTab: (t: EquipoTab) => void }) {
  const profilesQ = useProfiles();
  const profiles = useMemo(() => (profilesQ.data ?? []).filter((p) => p.visible), [profilesQ.data]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const activeId = profiles.some((p) => p.id === pickedId) ? (pickedId as string) : (profiles[0]?.id ?? '');
  const member = profiles.find((p) => p.id === activeId) ?? profiles[0];

  const premierQ = usePremier(activeId, 0, Boolean(activeId));
  const premier = premierQ.data ?? null;
  const error = (premierQ.error as Error | null)?.message ?? null;
  const client = useQueryClient();
  // El endpoint del servidor cachea 6 h; "Actualizar" solo re-pide si acaba de
  // cambiar algo (roster/resultados), no fuerza la API de Riot.
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['val-premier'] });
  };

  return (
    <div className="wrap">
      <TopBar
        accent="red"
        title="Equipo"
        subtitle={['Premier', 'equipo']}
        chip={
          <span className="chip-red">
            {premier ? `${premier.name}#${premier.tag}` : activeId ? 'sin equipo' : '—'}
          </span>
        }
        updated={null}
        onRefresh={refresh}
        loading={premierQ.isFetching}
        disabled={!activeId}
        activePage="equipo"
      />

      <EquipoTabs tab={tab} onTab={onTab} />

      {profiles.length === 0 && !profilesQ.isLoading ? (
        <div className="panel" style={{ marginTop: 20 }}>
          <p className="empty">
            No hay perfiles visibles. <Link href="/perfiles">Configura tus perfiles</Link> para ver su Premier.
          </p>
        </div>
      ) : (
        <>
          <div className="controls ranked-controls">
            <label>Jugador</label>
            <div className="player-row">
              <div className="player-chips" style={{ ['--accent-row' as string]: '#ff4655' }}>
                {profiles.map((p) => (
                  <button
                    key={p.id}
                    className={`f-chip${activeId === p.id ? ' player-on' : ''}`}
                    title={`${p.name}#${p.tag}${p.role ? ` · ${p.role}` : ''}`}
                    onClick={() => setPickedId(p.id)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <Link className="f-chip profile-chip add" href="/perfiles" title="Gestionar perfiles">
                ⚙ Perfiles
              </Link>
            </div>
            {member ? <span className="window-info">{member.name}#{member.tag}</span> : null}
          </div>

          <PremierTab premier={premier} loading={premierQ.isLoading} error={error} />
        </>
      )}
    </div>
  );
}
