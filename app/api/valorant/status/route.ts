import { NextRequest } from 'next/server';
import { VAL_CONFIG, RiotApiError, getProvider, getAccount } from '@/lib/valorant';
import { HENRIK_CONFIG, HenrikError, getHenrikAccount } from '@/lib/henrik';
import { resolvePlayer } from '@/lib/team';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const member = resolvePlayer(req.nextUrl.searchParams.get('player'));
  const provider = getProvider();
  const base = {
    keyConfigured: Boolean(provider),
    provider,
    name: `${member.name}#${member.tag}`,
    label: member.label,
    role: member.role,
    routing:
      provider === 'henrik'
        ? { region: HENRIK_CONFIG.region(), platform: HENRIK_CONFIG.platform() }
        : { cluster: VAL_CONFIG.cluster(), shard: VAL_CONFIG.shard() },
  };

  if (!provider) {
    return Response.json({
      ...base,
      ok: false,
      error: {
        code: 'KEY_MISSING',
        message:
          'Sin API key. Opción recomendada: HENRIK_API_KEY gratis en https://api.henrikdev.xyz/dashboard/',
      },
    });
  }

  try {
    if (provider === 'henrik') {
      const account = await getHenrikAccount(member.name, member.tag);
      return Response.json({
        ...base,
        ok: true,
        account: { gameName: account.name, tagLine: account.tag, puuid: account.puuid },
      });
    }
    const account = await getAccount();
    return Response.json({ ...base, ok: true, account });
  } catch (err) {
    const code = err instanceof HenrikError || err instanceof RiotApiError ? err.code : 'HTTP';
    return Response.json({
      ...base,
      ok: false,
      error: { code, message: err instanceof Error ? err.message : String(err) },
    });
  }
}
