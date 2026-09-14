import { NextRequest, NextResponse } from 'next/server';
import { setRiotLink } from '@/lib/auth';
import { identityProvider, syncRiotProfile } from '@/lib/identity';
import { logConsent } from '@/lib/consentLog';
import { clientIp } from '@/lib/clientIp';
import { isPublicMode } from '@/lib/appMode';
import { relativeRedirect } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** Callback de RSO: intercambia el code, vincula y vuelve a /cuenta. */
export async function GET(req: NextRequest) {
  if (!isPublicMode()) return NextResponse.json({ error: 'No disponible' }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const code = sp.get('code');
  const state = sp.get('state');
  const error = sp.get('error');
  if (error) {
    return relativeRedirect(`/cuenta?error=${encodeURIComponent(error)}`);
  }
  if (!code || !state) {
    return relativeRedirect('/cuenta?error=callback');
  }

  try {
    const { username, identity } = await identityProvider().handleCallback({ code, state, origin: req.nextUrl.origin });
    setRiotLink(username, identity);
    syncRiotProfile(username, identity);
    logConsent({ user: username, action: 'link', detail: `${identity.gameName}#${identity.tagLine} (rso)`, ip: clientIp(req) });
    return relativeRedirect('/cuenta?linked=1');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[rso] callback: ${msg}`);
    return relativeRedirect(`/cuenta?error=${encodeURIComponent('link')}`);
  }
}
