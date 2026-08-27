import { NextRequest } from 'next/server';
import { refreshPlayer, type RefreshScope } from '@/lib/refresh';
import { isValidPlayer } from '@/lib/team';

export const dynamic = 'force-dynamic';

/**
 * Revalidación tipo SWR: dispara el trabajo en segundo plano y responde
 * enseguida con { started: true }. El cliente sondea el summary comparando
 * window.syncedAt para saber cuándo terminó (sin gastar requests de Henrik).
 */
export async function POST(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const playerParam = sp.get('player');
  if (!isValidPlayer(playerParam)) {
    return Response.json({ error: `Jugador desconocido: ${playerParam}`, code: 'BAD_PLAYER' }, { status: 400 });
  }
  const scopeRaw = sp.get('scope');
  const scope: RefreshScope = scopeRaw === 'matches' || scopeRaw === 'mmr' ? scopeRaw : 'all';
  const rawLimit = Number(sp.get('limit') ?? '');
  const limit = Number.isFinite(rawLimit) && rawLimit >= 1 && rawLimit <= 40 ? Math.floor(rawLimit) : undefined;

  // Fire-and-forget: la revalidación corre tras responder. Errores se reflejan
  // en el sondeo del cliente ("sin cambios" si el servidor falló antes de subir).
  void refreshPlayer(playerParam || undefined, scope, limit).catch((err: unknown) => {
    console.error(`[refresh] ${playerParam ?? 'default'} -> ${err instanceof Error ? err.message : String(err)}`);
  });

  return Response.json({ started: true });
}
