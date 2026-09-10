import { deleteData } from './persist';
import { removeUserSubscriptions } from './push';

/**
 * Borra los datos privados de un usuario al eliminarlo:
 * favoritas, tokens RSO, dedupe de notificaciones y suscripciones push.
 * (Las notas por partida y los snapshots de auditoría quedan por autor/perfil;
 * los perfiles del usuario se borran aparte desde el panel.)
 */

function safeUser(user: string): string {
  return user.toLowerCase().replace(/[^a-z0-9._-]/g, '_');
}

export function cleanupUserData(user: string): void {
  const safe = safeUser(user);
  deleteData(`favorites.${safe}.json`);
  deleteData(`rso/${safe}.json`);
  deleteData(`store-notified.${safe}.json`);
  removeUserSubscriptions(user);
}
