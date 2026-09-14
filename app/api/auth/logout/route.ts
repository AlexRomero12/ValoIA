import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie, sessionFromRequest } from '@/lib/auth';
import { logAuth } from '@/lib/authLog';
import { revokeSession } from '@/lib/sessions';
import { clientIp } from '@/lib/clientIp';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = sessionFromRequest(req);
  if (session) {
    revokeSession(session.sid, session.u);
    logAuth('logout', { user: session.u, ip: clientIp(req) });
  }
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
