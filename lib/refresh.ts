import { revalidate, invalidatePrefix } from './cache';
import { backfillArchive, type BackfillMode, type BackfillResult } from './archive';
import {
  BUCKET_LIMIT,
  BUCKET_TTL_MS,
  fetchHenrikAccountRaw,
  fetchHenrikMmrHistoryRaw,
  henrikAccountKey,
  henrikMmrKey,
  syncMatchesBucket,
  type MatchesBucket,
} from './henrik';
import { getProvider } from './valorant';
import { getProfile } from './profiles';
import type { ProfileAccount } from './profileTypes';

export type RefreshScope = 'all' | 'matches' | 'mmr';

const ACCOUNT_TTL_MS = 60 * 60 * 1000;
const MMR_TTL_MS = 10 * 60 * 1000;

/**
 * Revalidación quirúrgica de un jugador:
 *  - Solo toca la caché de ese jugador (nunca la de los demás).
 *  - `matches` re-sincroniza el bucket de forma incremental (1 request si no hay novedades).
 *  - `mmr` re-descarga el historial RR (1 request).
 *  - `all` además refresca la cuenta (1 request, 1 h de vigencia).
 */
export async function refreshPlayer(
  playerId?: string,
  scope: RefreshScope = 'all',
  want?: number,
  account?: ProfileAccount,
): Promise<boolean> {
  const member = getProfile(playerId);
  const acct = account ?? { name: member.name, tag: member.tag };

  if (getProvider() !== 'henrik') {
    // Fallback Riot: sin bucket incremental; invalidamos y dejamos que el
    // siguiente GET de summary rellene el caché (las partidas completas
    // quedan cacheadas para siempre, solo se refetcsea el matchlist).
    invalidatePrefix('val:account:');
    invalidatePrefix('val:matchlist:');
    return true;
  }

  const target = Math.min(Math.max(want ?? BUCKET_LIMIT, 10), BUCKET_LIMIT);
  // Secuencial a propósito: en paralelo las 3 revalidaciones emitían ráfagas
  // que el throttle de Henrik penaliza con 429 (ver lib/henrik.ts).
  const results: boolean[] = [];

  if (scope === 'all' || scope === 'matches') {
    results.push(
      await revalidate<MatchesBucket>(bucketKeyOf(acct.name, acct.tag), BUCKET_TTL_MS, () =>
        syncMatchesBucket(acct.name, acct.tag, target),
      ).then(
        () => true,
        () => false,
      ),
    );
  }
  if (scope === 'all' || scope === 'mmr') {
    results.push(
      await revalidate(henrikMmrKey(acct.name, acct.tag), MMR_TTL_MS, () =>
        fetchHenrikMmrHistoryRaw(acct.name, acct.tag),
      ).then(
        () => true,
        () => false,
      ),
    );
  }
  if (scope === 'all') {
    results.push(
      await revalidate(henrikAccountKey(acct.name, acct.tag), ACCOUNT_TTL_MS, () =>
        fetchHenrikAccountRaw(acct.name, acct.tag).then((d) => d ?? {}),
      ).then(
        () => true,
        () => false,
      ),
    );
  }

  return results.length > 0 && results.every(Boolean);
}

function bucketKeyOf(name: string, tag: string): string {
  return `henrik:matches:v2:${encodeURIComponent(name)}:${encodeURIComponent(tag)}`;
}

export interface BackfillPlayerOptions {
  mode?: BackfillMode;
  maxPages?: number;
  force?: boolean;
}

/**
 * Backfill profundo del historial (estilo tracker.gg): pagina más allá del
 * bucket de 40 y archiva todo en el archivo acumulativo. El progreso persiste
 * página a página; un corte por rate limit no pierde lo ya descargado.
 * `account` permite hacerlo sobre una cuenta concreta de un miembro multi-cuenta.
 */
export async function backfillPlayer(
  playerId: string | undefined,
  opts: BackfillPlayerOptions = {},
  account?: ProfileAccount,
): Promise<BackfillResult> {
  const member = getProfile(playerId);
  const acct = account ?? { name: member.name, tag: member.tag };
  return backfillArchive(acct.name, acct.tag, opts);
}
