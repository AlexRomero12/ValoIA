import { NextRequest } from 'next/server';
import { refreshPlayer, type RefreshScope } from '@/lib/refresh';
import { getProfile, profileAccess } from '@/lib/profiles';
import { memberAccounts } from '@/lib/profileTypes';
import { viewerFromRequest } from '@/lib/auth';
import { rateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * Revalidación tipo SWR: dispara el trabajo en segundo plano y responde
 * enseguida con { started: true }. El cliente sondea el summary comparando
 * window.syncedAt para saber cuándo terminó (sin gastar requests de Henrik).
 */
export async function POST(req: NextRequest) {
  const viewer = viewerFromRequest(req);
  if (!viewer) return Response.json({ error: 'No autenticado', code: 'UNAUTHORIZED' }, { status: 401 });

  // Cooldown servidor por usuario (protege la cuota compartida de Henrik).
  const cooldownSec = Math.max(1, Number(process.env.REFRESH_COOLDOWN_SEC ?? '') || 10);
  const rl = rateLimit(`refresh:${viewer.username}`, 1, cooldownSec * 1000);
  if (!rl.ok) {
    return Response.json(
      { error: `Espera ${cooldownSec}s antes de volver a actualizar`, code: 'COOLDOWN' },
      { status: 429, headers: rl.retryAfterSec ? { 'Retry-After': String(rl.retryAfterSec) } : undefined },
    );
  }

  const sp = req.nextUrl.searchParams;
  const playerParam = sp.get('player');
  const access = profileAccess(playerParam, viewer);
  if (access === 'notfound') {
    return Response.json({ error: `Perfil desconocido: ${playerParam}`, code: 'BAD_PLAYER' }, { status: 400 });
  }
  if (access === 'forbidden') {
    return Response.json({ error: 'Ese perfil no es tuyo', code: 'FORBIDDEN' }, { status: 403 });
  }
  const scopeRaw = sp.get('scope');
  const scope: RefreshScope = scopeRaw === 'matches' || scopeRaw === 'mmr' ? scopeRaw : 'all';
  const rawLimit = Number(sp.get('limit') ?? '');
  const limit = Number.isFinite(rawLimit) && rawLimit >= 1 && rawLimit <= 40 ? Math.floor(rawLimit) : undefined;

  const member = getProfile(playerParam || undefined, viewer);
  if (!member) {
    return Response.json({ error: 'No tienes perfiles configurados', code: 'NO_PROFILES' }, { status: 404 });
  }

  // Cuenta alternativa (jugadores multi-cuenta): `account` = índice en memberAccounts().
  let account: { name: string; tag: string } | undefined;
  const rawAccount = sp.get('account');
  if (rawAccount != null) {
    const accs = memberAccounts(member);
    const idx = Number(rawAccount);
    if (Number.isInteger(idx) && idx >= 0 && idx < accs.length) {
      account = { name: accs[idx].name, tag: accs[idx].tag };
    }
  }

  // Fire-and-forget: la revalidación corre tras responder. Errores se reflejan
  // en el sondeo del cliente ("sin cambios" si el servidor falló antes de subir).
  void refreshPlayer(playerParam || undefined, scope, limit, account, viewer).catch((err: unknown) => {
    console.error(`[refresh] ${playerParam ?? 'default'} -> ${err instanceof Error ? err.message : String(err)}`);
  });

  return Response.json({ started: true });
}
