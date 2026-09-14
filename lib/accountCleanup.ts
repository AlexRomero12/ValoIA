import { deleteProfilesFor } from './profiles';
import { removeUserComments } from './matchComments';
import { removeUserSubscriptions } from './push';

/**
 * Baja de cuenta (modo público): purga los datos personales del usuario.
 * El archivo de partidas es data de juego desacoplada por matchId y no
 * contiene datos de la cuenta de la app.
 */
export function purgeUserData(username: string): { profiles: number; comments: number; subscriptions: number } {
  const profiles = deleteProfilesFor(username);
  const comments = removeUserComments(username);
  const subscriptions = removeUserSubscriptions(username);
  return { profiles, comments, subscriptions };
}
