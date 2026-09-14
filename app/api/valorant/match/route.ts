import { NextRequest } from 'next/server';
import { getMatchDetail } from '@/lib/matchDetail';
import { isValidProfile } from '@/lib/profiles';
import { viewerOrSingle } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const viewer = viewerOrSingle(req);
  if (!viewer) return Response.json({ error: 'No autenticado', code: 'UNAUTHORIZED' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const id = sp.get('id')?.trim();
  if (!id) return Response.json({ error: 'Falta id de partida', code: 'BAD_REQUEST' }, { status: 400 });
  const player = sp.get('player') ?? undefined;
  if (player && !isValidProfile(player, viewer)) {
    return Response.json({ error: `Perfil desconocido: ${player}`, code: 'BAD_PLAYER' }, { status: 400 });
  }
  try {
    const detail = await getMatchDetail(id, player, viewer);
    return Response.json(detail, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const code = (err as { code?: string })?.code ?? 'HTTP';
    return Response.json(
      { error: err instanceof Error ? err.message : String(err), code },
      { status: 404 },
    );
  }
}
