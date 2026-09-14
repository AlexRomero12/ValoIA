import { NextRequest, NextResponse } from 'next/server';
import { sessionFromRequest, setRiotLink } from '@/lib/auth';
import { identityProvider, syncRiotProfile } from '@/lib/identity';
import { logConsent } from '@/lib/consentLog';
import { clientIp } from '@/lib/clientIp';
import { rateLimit } from '@/lib/rateLimit';
import { isPublicMode } from '@/lib/appMode';

export const dynamic = 'force-dynamic';

/**
 * Vinculación de la cuenta de Riot.
 *  - Mock (demo): body { gameName?, tagLine? } y se vincula al instante.
 *  - RSO real: devuelve { url } para redirigir a auth.riotgames.com.
 */
export async function POST(req: NextRequest) {
  if (!isPublicMode()) return NextResponse.json({ error: 'No disponible' }, { status: 403 });
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'No autenticado', code: 'UNAUTHORIZED' }, { status: 401 });

  const rl = rateLimit(`riot-link:${session.u}`, 10, 10 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: 'Demasiados intentos' }, { status: 429 });

  let body: { gameName?: string; tagLine?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* sin body: el demo usa la cuenta del entorno */
  }

  try {
    const origin = req.nextUrl.origin;
    const result = await identityProvider().startLink({ username: session.u, gameName: body.gameName, tagLine: body.tagLine, origin });
    if (result.kind === 'redirect') return NextResponse.json({ ok: true, mode: 'rso', url: result.url });

    setRiotLink(session.u, { ...result.identity });
    syncRiotProfile(session.u, result.identity);
    logConsent({ user: session.u, action: 'link', detail: `${result.identity.gameName}#${result.identity.tagLine}`, ip: clientIp(req) });
    return NextResponse.json({ ok: true, mode: 'mock', identity: result.identity });
  } catch (e) {
    const code = (e as { code?: string })?.code;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e), code: code ?? 'LINK_FAILED' },
      { status: code === 'MOCK_ONLY' ? 400 : 500 },
    );
  }
}
