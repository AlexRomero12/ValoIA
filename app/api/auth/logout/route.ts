import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie, sessionFromRequest } from '@/lib/auth';
import { logAuth } from '@/lib/authLog';
import { clientIp } from '@/lib/clientIp';
import { revokeSession } from '@/lib/sessions';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = sessionFromRequest(req);
  if (session) {
    revokeSession(session.sid);
    logAuth('logout', { user: session.u, ip: clientIp(req) });
  }
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
