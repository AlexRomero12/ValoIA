import { NextRequest } from 'next/server';
import { getValSummary } from '@/lib/valorant';
import { refreshPlayer } from '@/lib/refresh';
import { profileAccess, getProfile } from '@/lib/profiles';
import { memberAccounts } from '@/lib/profileTypes';
import { viewerFromRequest } from '@/lib/auth';
import { rateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const viewer = viewerFromRequest(req);
  if (!viewer) return Response.json({ error: 'No autenticado', code: 'UNAUTHORIZED' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const rawDays = Number(sp.get('days') ?? '');
  const days = Number.isFinite(rawDays) && rawDays >= 1 && rawDays <= 365 ? Math.floor(rawDays) : 30;
  const seasonParam = sp.get('season')?.trim();
  const season = seasonParam && seasonParam.length > 0 ? seasonParam : undefined;
  const rawLimit = Number(sp.get('limit') ?? '');
  const limit = Number.isFinite(rawLimit) && rawLimit >= 1 && rawLimit <= 40 ? Math.floor(rawLimit) : undefined;
  const playerParam = sp.get('player');
  const access = profileAccess(playerParam, viewer);
  if (access === 'notfound') {
    return Response.json({ error: `Perfil desconocido: ${playerParam}`, code: 'BAD_PLAYER' }, { status: 400 });
  }
  if (access === 'forbidden') {
    return Response.json({ error: 'Ese perfil no es tuyo', code: 'FORBIDDEN' }, { status: 403 });
  }
  const playerId = playerParam || undefined;
  const member = getProfile(playerId, viewer);
  if (!member) {
    return Response.json({ error: 'No tienes perfiles configurados', code: 'NO_PROFILES' }, { status: 404 });
  }

  // Cuenta alternativa (jugadores multi-cuenta): `account` = índice en memberAccounts().
  let accountName: string | undefined;
  let accountTag: string | undefined;
  const rawAccount = sp.get('account');
  if (rawAccount != null) {
    const accs = memberAccounts(member);
    const idx = Number(rawAccount);
    if (Number.isInteger(idx) && idx >= 0 && idx < accs.length) {
      accountName = accs[idx].name;
      accountTag = accs[idx].tag;
    }
  }

  try {
    // Compat: refresh=1 en GET = revalidación síncrona (los clientes nuevos
    // usan POST /api/valorant/refresh y esperan la señal de syncedAt).
    if (sp.get('refresh') === '1') {
      const cooldownSec = Math.max(1, Number(process.env.REFRESH_COOLDOWN_SEC ?? '') || 10);
      const rl = rateLimit(`refresh:${viewer.username}`, 1, cooldownSec * 1000);
      if (!rl.ok) {
        return Response.json(
          { error: `Espera ${cooldownSec}s antes de volver a actualizar`, code: 'COOLDOWN' },
          { status: 429, headers: rl.retryAfterSec ? { 'Retry-After': String(rl.retryAfterSec) } : undefined },
        );
      }
      await refreshPlayer(playerId, 'all', limit ?? 20, accountName ? { name: accountName, tag: accountTag! } : undefined, viewer);
    }
    const summary = await getValSummary({ days, season, maxFetch: limit, playerId, accountName, accountTag, viewer });
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
