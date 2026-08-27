import { getTeam } from './team';
import { refreshPlayer } from './refresh';
import { BUCKET_LIMIT } from './henrik';

/**
 * Sincroniza el bucket + MMR de todos los jugadores del equipo,
 * secuencialmente para respetar el throttle global (24 req/min).
 * El sync incremental hace que un ciclo típico sea 1 request por jugador.
 */
export async function warmAllPlayers(want: number = BUCKET_LIMIT): Promise<void> {
  for (const member of getTeam()) {
    try {
      await refreshPlayer(member.id, 'mmr', want);
      await refreshPlayer(member.id, 'matches', want);
    } catch {
      // El siguiente ciclo lo reintenta; el dashboard igual se sirve del disco.
    }
  }
}
