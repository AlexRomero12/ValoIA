import { NextRequest } from 'next/server';
import { getServiceStatus } from '@/lib/serviceStatus';
import { viewerFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** Estado de los servidores de Riot (mantenimientos/incidencias) para el aviso global. */
export async function GET(req: NextRequest) {
  const viewer = viewerFromRequest(req);
  if (!viewer) return Response.json({ error: 'No autenticado', code: 'UNAUTHORIZED' }, { status: 401 });

  const status = await getServiceStatus();
  return Response.json(status, { headers: { 'Cache-Control': 'no-store' } });
}
