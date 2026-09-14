import { getArchiveStats } from '@/lib/archive';
import { getProfile, listViewableProfilesFor } from '@/lib/profiles';
import { memberAccounts } from '@/lib/profileTypes';
import { viewerOrSingle } from '@/lib/auth';
import { getProvider, RIOT_CONFIG } from '@/lib/valorant';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Estado del archivo acumulativo por cuenta accesible al visor. El backfill
 * profundo NO existe en la rama Riot: la API oficial no pagina historial.
 */
export async function GET(req: NextRequest) {
  const viewer = viewerOrSingle(req);
  if (!viewer) return Response.json({ error: 'No autenticado', code: 'UNAUTHORIZED' }, { status: 401 });

  const playerParam = req.nextUrl.searchParams.get('player');
  const profiles = playerParam
    ? [getProfile(playerParam, viewer)].filter((p): p is NonNullable<typeof p> => p != null)
    : listViewableProfilesFor(viewer);
  if (playerParam && profiles.length === 0) {
    return Response.json({ error: `Perfil desconocido: ${playerParam}`, code: 'BAD_PLAYER' }, { status: 400 });
  }

  const players = profiles.flatMap((member) =>
    memberAccounts(member).map((a, i) => ({
      id: i === 0 ? member.id : `${member.id}:${i}`,
      label: i === 0 ? member.label : `${member.label} alt ${i}`,
      name: a.name,
      tag: a.tag,
      archive: getArchiveStats(a.name, a.tag),
    })),
  );
  return Response.json(
    { provider: getProvider(), source: RIOT_CONFIG.matchSource(), players },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST() {
  return Response.json(
    {
      error:
        'La API oficial de Riot no pagina el historial (matchlists devuelve una ventana reciente): el backfill profundo no existe en esta rama.',
      code: 'PROVIDER_UNSUPPORTED',
    },
    { status: 400 },
  );
}
