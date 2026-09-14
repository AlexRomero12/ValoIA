import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie, deleteOwnAccount, sessionFromRequest } from '@/lib/auth';
import { purgeUserData } from '@/lib/accountCleanup';
import { logConsent } from '@/lib/consentLog';
import { logAuth } from '@/lib/authLog';
import { clientIp } from '@/lib/clientIp';
import { isPublicMode } from '@/lib/appMode';

export const dynamic = 'force-dynamic';

/** Baja de cuenta: { action: 'delete', password }. Purga los datos personales. */
export async function POST(req: NextRequest) {
  if (!isPublicMode()) return NextResponse.json({ error: 'No disponible' }, { status: 403 });
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'No autenticado', code: 'UNAUTHORIZED' }, { status: 401 });

  let body: { action?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }
  if (body.action !== 'delete') return NextResponse.json({ error: 'Acción desconocida (delete)' }, { status: 400 });

  const result = deleteOwnAccount(session.u, String(body.password ?? ''));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });

  const purged = purgeUserData(session.u);
  logConsent({ user: session.u, action: 'account-delete', detail: JSON.stringify(purged), ip: clientIp(req) });
  logAuth('account_delete', { user: session.u, ip: clientIp(req) });

  const res = NextResponse.json({ ok: true, purged });
  clearSessionCookie(res);
  return res;
}
