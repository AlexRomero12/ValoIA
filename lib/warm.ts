import { listVisibleProfiles } from './profiles';
import { refreshPlayer } from './refresh';
import { BUCKET_LIMIT } from './henrik';

/**
 * Sincroniza el bucket + MMR de los perfiles VISIBLES (los que aparecen en
 * Ranked/Auditoría), secuencialmente para respetar el throttle global de
 * Henrik (~18 req/min). El sync incremental hace que un ciclo típico sea
 * 1 request por perfil.
 */
export async function warmAllPlayers(want: number = BUCKET_LIMIT): Promise<void> {
  for (const member of listVisibleProfiles()) {
    try {
      await refreshPlayer(member.id, 'mmr', want);
      await refreshPlayer(member.id, 'matches', want);
    } catch {
      // El siguiente ciclo lo reintenta; el dashboard igual se sirve del disco.
    }
  }
}
