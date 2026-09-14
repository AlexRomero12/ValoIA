import { NextRequest, NextResponse } from 'next/server';
import { getUser, sessionFromRequest, setConsent } from '@/lib/auth';
import { logConsent } from '@/lib/consentLog';
import { clientIp } from '@/lib/clientIp';
import { isPublicMode } from '@/lib/appMode';

export const dynamic = 'force-dynamic';

const POLICY_VERSION = 1;

/**
 * Consolidación del consentimiento (Riot exige opt-in explícito y auditable):
 *  { accept: true, publicProfile: boolean }
 */
export async function POST(req: NextRequest) {
  if (!isPublicMode()) return NextResponse.json({ error: 'No disponible' }, { status: 403 });
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'No autenticado', code: 'UNAUTHORIZED' }, { status: 401 });

  let body: { accept?: boolean; publicProfile?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }
  if (body.accept !== true) {
    return NextResponse.json({ error: 'Debes aceptar el tratamiento de datos' }, { status: 400 });
  }

  const before = getUser(session.u);
  const updated = setConsent(session.u, { publicProfile: body.publicProfile === true, policyVersion: POLICY_VERSION });
  if (!updated) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });

  const ip = clientIp(req);
  logConsent({ user: session.u, action: 'consent', detail: `v${POLICY_VERSION}`, ip });
  if (body.publicProfile === true && before?.publicProfile !== true) {
    logConsent({ user: session.u, action: 'optin', detail: 'perfil público', ip });
  } else if (body.publicProfile !== true && before?.publicProfile === true) {
    logConsent({ user: session.u, action: 'optout', detail: 'perfil privado', ip });
  }

  return NextResponse.json({ ok: true, consentAt: updated.consentAt, publicProfile: updated.publicProfile === true });
}
