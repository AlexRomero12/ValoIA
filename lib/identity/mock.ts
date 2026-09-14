import { env } from '../env';
import { RIOT_CONFIG } from '../riot/client';
import { resolveAccount } from '../riot/account';
import type { IdentityProvider, LinkStart, LinkedIdentity } from './types';

/**
 * Proveedor de demostración: simula la vinculación con RSO usando la identidad
 * configurada en el entorno (VAL_NAME/VAL_TAG) — la misma de los fixtures.
 * No requiere credenciales de Riot; el puuid sale de ACCOUNT-V1 o del fixture.
 */

function allowedIds(): { gameName: string; tagLine: string }[] {
  const raw = env('MOCK_RIOT_IDS', '').trim();
  const list = raw
    ? raw.split(',').map((s) => s.trim()).filter(Boolean)
    : [`${RIOT_CONFIG.name()}#${RIOT_CONFIG.tag()}`];
  return list.map((id) => {
    const i = id.lastIndexOf('#');
    return i >= 0 ? { gameName: id.slice(0, i), tagLine: id.slice(i + 1) } : { gameName: id, tagLine: '' };
  });
}

async function link(input: { gameName?: string; tagLine?: string }): Promise<LinkedIdentity> {
  const candidates = allowedIds();
  const wanted = (input.gameName ?? candidates[0].gameName).toLowerCase();
  const wantedTag = (input.tagLine ?? candidates[0].tagLine).toLowerCase();
  const match = candidates.find(
    (c) => c.gameName.toLowerCase() === wanted && (!wantedTag || c.tagLine.toLowerCase() === wantedTag),
  );
  if (!match) {
    throw Object.assign(new Error(`En modo demo solo puedes vincular: ${candidates.map((c) => `${c.gameName}#${c.tagLine}`).join(', ')}`), {
      code: 'MOCK_ONLY',
    });
  }
  const account = await resolveAccount(match.gameName, match.tagLine);
  return {
    gameName: account.gameName,
    tagLine: account.tagLine,
    puuid: account.puuid ?? '',
    mock: true,
  };
}

export const mockProvider: IdentityProvider = {
  id: 'mock',
  async startLink(input): Promise<LinkStart> {
    return { kind: 'linked', identity: await link(input) };
  },
  async handleCallback(): Promise<{ username: string; identity: LinkedIdentity }> {
    throw Object.assign(new Error('El proveedor demo no usa callback'), { code: 'NO_CALLBACK' });
  },
};
