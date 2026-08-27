import { NextRequest } from 'next/server';
import { getValSummary } from '@/lib/valorant';
import { refreshPlayer } from '@/lib/refresh';
import { isValidPlayer } from '@/lib/team';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const rawDays = Number(sp.get('days') ?? '');
  const days = Number.isFinite(rawDays) && rawDays >= 1 && rawDays <= 365 ? Math.floor(rawDays) : 30;
  const seasonParam = sp.get('season')?.trim();
  const season = seasonParam && seasonParam.length > 0 ? seasonParam : undefined;
  const rawLimit = Number(sp.get('limit') ?? '');
  const limit = Number.isFinite(rawLimit) && rawLimit >= 1 && rawLimit <= 40 ? Math.floor(rawLimit) : undefined;
  const playerParam = sp.get('player');
  if (!isValidPlayer(playerParam)) {
    return Response.json({ error: `Jugador desconocido: ${playerParam}`, code: 'BAD_PLAYER' }, { status: 400 });
  }
  const playerId = playerParam || undefined;

  try {
    // Compat: refresh=1 en GET = revalidación síncrona (los clientes nuevos
    // usan POST /api/valorant/refresh y esperan la señal de syncedAt).
    if (sp.get('refresh') === '1') {
      await refreshPlayer(playerId, 'all', limit ?? 20);
    }
    const summary = await getValSummary({ days, season, maxFetch: limit, playerId });
    return Response.json(summary, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const code = (err as { code?: string })?.code ?? 'HTTP';
    const isKeyIssue = code === 'KEY_MISSING' || code === 'KEY_EXPIRED' || code === 'KEY_INVALID';
    return Response.json(
      { error: err instanceof Error ? err.message : String(err), code },
      { status: isKeyIssue ? 403 : 500 },
    );
  }
}
