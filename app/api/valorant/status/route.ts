import { NextRequest } from 'next/server';
import { getProfile } from '@/lib/profiles';
import { viewerOrSingle } from '@/lib/auth';
import {
  RIOT_CONFIG,
  RiotApiError,
  getProvider,
  resolveAccount,
  getActiveShard,
} from '@/lib/valorant';

export const dynamic = 'force-dynamic';

/** Estado del proveedor (Riot), la key, el origen de partidas y la cuenta. */
export async function GET(req: NextRequest) {
  const viewer = viewerOrSingle(req);
  if (!viewer) return Response.json({ error: 'No autenticado', code: 'UNAUTHORIZED' }, { status: 401 });

  const playerParam = req.nextUrl.searchParams.get('player');
  const member = getProfile(playerParam, viewer);
  if (!member) {
    return Response.json({ error: 'No hay perfil configurado', code: 'NO_PROFILES' }, { status: 404 });
  }
  const provider = getProvider();
  const source = RIOT_CONFIG.matchSource();
  const base = {
    provider,
    source,
    name: `${member.name}#${member.tag}`,
    label: member.label,
    role: member.role,
    routing: { cluster: RIOT_CONFIG.cluster(), shard: RIOT_CONFIG.shard() },
  };

  if (!provider) {
    return Response.json({
      ...base,
      ok: false,
      error: {
        code: 'KEY_MISSING',
        message: 'Falta RIOT_API_KEY. Genera una dev key en https://developer.riotgames.com',
      },
    });
  }

  try {
    const account = await resolveAccount(member.name ?? '', member.tag ?? '');
    const activeShard = account.puuid ? await getActiveShard(account.puuid).catch(() => null) : null;
    return Response.json({
      ...base,
      ok: true,
      account: { gameName: account.gameName, tagLine: account.tagLine, puuid: account.puuid, demo: account.demo === true },
      activeShard,
      matchesLive: source === 'live',
    });
  } catch (err) {
    const code = err instanceof RiotApiError ? err.code : 'HTTP';
    return Response.json({
      ...base,
      ok: false,
      error: { code, message: err instanceof Error ? err.message : String(err) },
    });
  }
}
