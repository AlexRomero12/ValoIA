import { revalidate } from './cache';
import { BUCKET_LIMIT, BUCKET_TTL_MS, matchesBucketKey, syncMatches } from './riot/matches';
import { fetchAccountRaw, riotAccountKey, resolveAccount } from './riot/account';
import { canAccessProfile, requireProfile, type ProfileViewer } from './profiles';
import { isPublicMode } from './appMode';
import type { ProfileAccount } from './profileTypes';

export type RefreshScope = 'all' | 'matches';

const ACCOUNT_TTL_MS = 60 * 60 * 1000;

/**
 * Revalidación de un perfil:
 *  - `matches` re-sincroniza el bucket de partidas (mock o live).
 *  - `all` además refresca la cuenta (Riot ID → PUUID, 1 h de vigencia).
 * En modo público solo el dueño puede revalidar (consume cuota de la API).
 */
export async function refreshPlayer(
  playerId?: string,
  scope: RefreshScope = 'all',
  want?: number,
  account?: ProfileAccount,
  viewer?: ProfileViewer,
): Promise<boolean> {
  const member = requireProfile(playerId, viewer);
  if (isPublicMode() && viewer && !canAccessProfile(member, viewer)) {
    throw Object.assign(new Error('Ese perfil no es tuyo'), { code: 'FORBIDDEN' });
  }
  const acct = { name: account?.name ?? member.name ?? '', tag: account?.tag ?? member.tag ?? '' };
  const target = Math.min(Math.max(want ?? BUCKET_LIMIT, 10), BUCKET_LIMIT);
  const resolved = await resolveAccount(acct.name, acct.tag);
  if (!resolved.puuid) throw new Error(`Cuenta ${acct.name}#${acct.tag} sin puuid`);
  const results: boolean[] = [];

  if (scope === 'all' || scope === 'matches') {
    results.push(
      await revalidate(matchesBucketKey(acct.name, acct.tag), BUCKET_TTL_MS, () =>
        syncMatches(acct.name, acct.tag, resolved.puuid!, target),
      ).then(
        () => true,
        () => false,
      ),
    );
  }
  if (scope === 'all') {
    results.push(
      await revalidate(riotAccountKey(acct.name, acct.tag), ACCOUNT_TTL_MS, () =>
        fetchAccountRaw(acct.name, acct.tag).then((d) => d ?? {}),
      ).then(
        () => true,
        () => false,
      ),
    );
  }

  return results.length > 0 && results.every(Boolean);
}
