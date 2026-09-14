import { cached } from '../cache';
import { RIOT_CONFIG, RiotApiError, accountHost, riotFetch } from './client';
import { getMockPuuid } from './mock';
import type { RiotAccountDto, RiotActiveShardDto } from './types';
import type { ValAccount } from '../types';

/**
 * ACCOUNT-V1: fuente de identidad. Funciona con dev key (verificado).
 * `resolveAccount` sirve también para cuentas alternativas del perfil.
 *
 * Demo: si la dev key falta o expiró y el origen de partidas es `mock`, se usa
 * la identidad del fixture para que el sitio de revisión no se rompa cada 24 h.
 */

/** Key de caché de la cuenta (compartida con lib/refresh.ts). */
export function riotAccountKey(name: string, tag: string): string {
  return `riot:account:${encodeURIComponent(name)}:${encodeURIComponent(tag)}`;
}

/** Fetch bruto (sin caché), para revalidaciones. */
export async function fetchAccountRaw(name: string, tag: string): Promise<RiotAccountDto | null> {
  const n = encodeURIComponent(name);
  const t = encodeURIComponent(tag);
  try {
    return await riotFetch<RiotAccountDto>(`${accountHost()}/riot/account/v1/accounts/by-riot-id/${n}/${t}`);
  } catch {
    return null;
  }
}

export async function resolveAccount(name: string, tag: string): Promise<ValAccount> {
  try {
    const data = await cached(riotAccountKey(name, tag), 60 * 60 * 1000, () => fetchAccountRaw(name, tag));
    if (!data?.puuid) throw new RiotApiError('NOT_FOUND', `Cuenta ${name}#${tag} no encontrada`);
    return { puuid: data.puuid, gameName: data.gameName ?? name, tagLine: data.tagLine ?? tag };
  } catch (e) {
    if (RIOT_CONFIG.matchSource() === 'mock') {
      console.warn(`[riot] identidad en modo demo para ${name}#${tag}: ${e instanceof Error ? e.message : String(e)}`);
      return {
        puuid: getMockPuuid(),
        gameName: RIOT_CONFIG.name(),
        tagLine: RIOT_CONFIG.tag(),
        demo: true,
      };
    }
    throw e;
  }
}

/** Cuenta del `.env` (VAL_NAME/VAL_TAG): la única de esta rama. */
export async function getAccount(): Promise<ValAccount> {
  return resolveAccount(RIOT_CONFIG.name(), RIOT_CONFIG.tag());
}

/** Shard activo de la cuenta (informativo; el match API usa la plataforma). */
export async function getActiveShard(puuid: string): Promise<string | null> {
  return cached(`riot:active-shard:${puuid}`, 60 * 60 * 1000, async () => {
    const data = await riotFetch<RiotActiveShardDto>(
      `${accountHost()}/riot/account/v1/active-shards/by-game/val/by-puuid/${puuid}`,
    );
    return data?.activeShard ?? null;
  });
}
