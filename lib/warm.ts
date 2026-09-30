import { listVisibleProfiles } from './profiles';
import { refreshPlayer } from './refresh';
import { BUCKET_LIMIT } from './henrik';
import { memberAccounts } from './profileTypes';

/**
 * Sincroniza bucket + MMR + cuenta de TODAS las cuentas de los perfiles
 * VISIBLES (los que aparecen en Ranked/Reglas), secuencialmente para respetar
 * el throttle global de Henrik. El sync incremental suele costar 3 requests por
 * cuenta (uno por fuente), así que abrir el dashboard cuesta $0 requests.
 */
export async function warmAllPlayers(want: number = BUCKET_LIMIT): Promise<void> {
  for (const member of listVisibleProfiles()) {
    for (const acct of memberAccounts(member)) {
      try {
        await refreshPlayer(member.id, 'all', want, acct);
      } catch {
        // El siguiente ciclo lo reintenta; el dashboard igual se sirve del disco.
      }
    }
  }
}
