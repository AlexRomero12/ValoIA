import { NextRequest, NextResponse } from 'next/server';
import { setRiotLink } from '@/lib/auth';
import { identityProvider, syncRiotProfile } from '@/lib/identity';
import { logConsent } from '@/lib/consentLog';
import { clientIp } from '@/lib/clientIp';
import { isPublicMode } from '@/lib/appMode';

export const dynamic = 'force-dynamic';

/** Callback de RSO: intercambia el code, vincula y vuelve a /cuenta. */
export async function GET(req: NextRequest) {
  if (!isPublicMode()) return NextResponse.json({ error: 'No disponible' }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const code = sp.get('code');
  const state = sp.get('state');
  const error = sp.get('error');
  if (error) {
    return NextResponse.redirect(new URL(`/cuenta?error=${encodeURIComponent(error)}`, req.url));
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL('/cuenta?error=callback', req.url));
  }

  try {
    const { username, identity } = await identityProvider().handleCallback({ code, state, origin: req.nextUrl.origin });
    setRiotLink(username, identity);
    syncRiotProfile(username, identity);
    logConsent({ user: username, action: 'link', detail: `${identity.gameName}#${identity.tagLine} (rso)`, ip: clientIp(req) });
    return NextResponse.redirect(new URL('/cuenta?linked=1', req.url));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[rso] callback: ${msg}`);
    return NextResponse.redirect(new URL(`/cuenta?error=${encodeURIComponent('link')}`, req.url));
  }
}
