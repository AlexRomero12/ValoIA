import { listVisibleProfiles } from './profiles';
import { refreshPlayer } from './refresh';
import { BUCKET_LIMIT } from './riot/matches';

/**
 * Sincroniza el bucket de partidas del perfil único para que abrir el
 * dashboard cueste menos requests. El sync incremental es barato cuando no hay
 * novedades (solo lee el matchlist).
 */
export async function warmAllPlayers(want: number = BUCKET_LIMIT): Promise<void> {
  for (const member of listVisibleProfiles()) {
    try {
      await refreshPlayer(member.id, 'matches', want);
    } catch {
      // El siguiente ciclo lo reintenta; el dashboard igual se sirve del disco.
    }
  }
}
