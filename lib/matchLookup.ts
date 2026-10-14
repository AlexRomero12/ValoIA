import { findCachedValues } from './cache';
import { getArchiveMatchById } from './archive';
import { getHenrikAccount, type HenrikMatch } from './henrik';
import { listProfiles, listProfilesFor, type ProfileViewer } from './profiles';
import { memberAccounts, type Profile } from './profileTypes';

/**
 * Localización de una partida por id, compartida por el detalle (`matchDetail`)
 * y por la cronología (`timeline`): las dos necesitan exactamente la misma
 * partida y con el mismo orden de búsqueda.
 *
 * Orden (importa, y es el mismo en los dos sitios):
 *  1) Archivo acumulativo (`data/archive`): cubre partidas fuera del bucket de 40.
 *  2) Buckets cacheados (`henrik:matches:<puuid>`): ventana fresca.
 *
 * Se recorren TODAS las cuentas de cada perfil porque un perfil multi-cuenta
 * puede deber la partida a cualquiera de ellas.
 */

export interface FoundMatch {
  match: HenrikMatch;
  /** puuid de la cuenta dueña de la partida (la que la tiene en su historial). */
  ownerPuuid: string;
  /** perfil al que pertenece esa cuenta. */
  profile: Profile;
}

/**
 * Perfiles a consultar, con el preferido primero. `playerId` elige el perfil
 * cuando la vista viene de una fila concreta; si no, se usa el primero.
 */
export function orderedProfiles(playerId?: string | null, viewer?: ProfileViewer): Profile[] {
  const candidates = viewer ? listProfilesFor(viewer) : listProfiles();
  if (candidates.length === 0) {
    throw Object.assign(new Error('No tienes perfiles configurados'), { code: 'NOT_CACHED' });
  }
  const preferred = candidates.find((m) => m.id === playerId) ?? candidates[0];
  return [preferred, ...candidates.filter((m) => m.id !== preferred.id)];
}

/** Busca la partida en el archivo y en los buckets cacheados, perfil a perfil. */
export async function findMatch(matchId: string, members: Profile[]): Promise<FoundMatch | null> {
  for (const member of members) {
    for (const acct of memberAccounts(member)) {
      const acc = await getHenrikAccount(acct.name, acct.tag).catch(() => null);
      if (!acc?.puuid) continue;
      const archived = getArchiveMatchById(acct.name, acct.tag, matchId);
      if (archived) return { match: archived, ownerPuuid: acc.puuid, profile: member };
      const found = findCachedValues<HenrikMatch[]>(`henrik:matches:${acc.puuid}`)
        .flat()
        .find((m) => m.metadata?.match_id === matchId);
      if (found) return { match: found, ownerPuuid: acc.puuid, profile: member };
    }
  }
  return null;
}

/** Error común cuando la partida no está ni en el archivo ni en la ventana cacheada. */
export function notCachedError(): Error {
  return Object.assign(
    new Error(
      'Partida fuera del cache — amplía la ventana o pulsa Actualizar para recargarla. Para partidas muy antiguas, lanza un backfill del historial (POST /api/valorant/backfill).',
    ),
    { code: 'NOT_CACHED' },
  );
}
