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
import { resolvePlayer, type TeamAccount } from './team';

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
  account?: TeamAccount,
): Promise<boolean> {
  const member = resolvePlayer(playerId);
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
  const jobs: Promise<unknown>[] = [];

  if (scope === 'all' || scope === 'matches') {
    jobs.push(
      revalidate<MatchesBucket>(bucketKeyOf(acct.name, acct.tag), BUCKET_TTL_MS, () =>
        syncMatchesBucket(acct.name, acct.tag, target),
      ),
    );
  }
  if (scope === 'all' || scope === 'mmr') {
    jobs.push(revalidate(henrikMmrKey(acct.name, acct.tag), MMR_TTL_MS, () =>
      fetchHenrikMmrHistoryRaw(acct.name, acct.tag),
    ));
  }
  if (scope === 'all') {
    jobs.push(revalidate(henrikAccountKey(acct.name, acct.tag), ACCOUNT_TTL_MS, () =>
      fetchHenrikAccountRaw(acct.name, acct.tag).then((d) => d ?? {}),
    ));
  }

  const results = await Promise.allSettled(jobs);
  return results.some((r) => r.status === 'fulfilled');
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
  account?: TeamAccount,
): Promise<BackfillResult> {
  const member = resolvePlayer(playerId);
  const acct = account ?? { name: member.name, tag: member.tag };
  return backfillArchive(acct.name, acct.tag, opts);
}
