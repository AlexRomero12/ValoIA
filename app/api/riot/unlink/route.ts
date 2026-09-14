import { NextRequest, NextResponse } from 'next/server';
import { sessionFromRequest, unlinkRiot } from '@/lib/auth';
import { logConsent } from '@/lib/consentLog';
import { clientIp } from '@/lib/clientIp';
import { isPublicMode } from '@/lib/appMode';

export const dynamic = 'force-dynamic';

/** Desvincula Riot: el perfil deja de mostrarse a terceros al instante. */
export async function POST(req: NextRequest) {
  if (!isPublicMode()) return NextResponse.json({ error: 'No disponible' }, { status: 403 });
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'No autenticado', code: 'UNAUTHORIZED' }, { status: 401 });

  const updated = unlinkRiot(session.u);
  if (!updated) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
  logConsent({ user: session.u, action: 'unlink', ip: clientIp(req) });
  return NextResponse.json({ ok: true });
}
