import { revalidate, invalidatePrefix } from './cache';
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
import { resolvePlayer, type TeamMember } from './team';

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
export async function refreshPlayer(playerId?: string, scope: RefreshScope = 'all', want?: number): Promise<boolean> {
  const member = resolvePlayer(playerId);

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
      revalidate<MatchesBucket>(bucketKeyOf(member), BUCKET_TTL_MS, () =>
        syncMatchesBucket(member.name, member.tag, target),
      ),
    );
  }
  if (scope === 'all' || scope === 'mmr') {
    jobs.push(revalidate(henrikMmrKey(member.name, member.tag), MMR_TTL_MS, () =>
      fetchHenrikMmrHistoryRaw(member.name, member.tag),
    ));
  }
  if (scope === 'all') {
    jobs.push(revalidate(henrikAccountKey(member.name, member.tag), ACCOUNT_TTL_MS, () =>
      fetchHenrikAccountRaw(member.name, member.tag).then((d) => d ?? {}),
    ));
  }

  const results = await Promise.allSettled(jobs);
  return results.some((r) => r.status === 'fulfilled');
}

function bucketKeyOf(member: TeamMember): string {
  return `henrik:matches:v2:${encodeURIComponent(member.name)}:${encodeURIComponent(member.tag)}`;
}
