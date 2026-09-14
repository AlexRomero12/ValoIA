import { NextRequest, NextResponse } from 'next/server';
import { isAdmin, sessionFromRequest } from '@/lib/auth';
import { listAuthLog } from '@/lib/authLog';
import { isPublicMode } from '@/lib/appMode';

export const dynamic = 'force-dynamic';

/** Actividad reciente (admin). */
export async function GET(req: NextRequest) {
  const session = isPublicMode() ? sessionFromRequest(req) : null;
  if (isPublicMode() && (!session || !isAdmin(session.u))) {
    return NextResponse.json({ error: 'Solo el administrador' }, { status: 403 });
  }
  return NextResponse.json({ events: listAuthLog(200) });
}
