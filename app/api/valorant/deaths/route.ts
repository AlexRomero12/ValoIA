import { NextRequest } from 'next/server';
import { viewerFromRequest } from '@/lib/auth';
import { memberAccounts } from '@/lib/profileTypes';
import { profileAccess } from '@/lib/profiles';
import { orderedProfiles } from '@/lib/matchLookup';
import { getArchiveMatches } from '@/lib/archive';
import { getHenrikAccount, henrikMatchId, henrikMatchTimestamp } from '@/lib/henrik';
import { buildDeathReport, type DeathMatchInput, type DeathTarget } from '@/lib/deathContext';
import { isoDayLocal } from '@/lib/dates';

export const dynamic = 'force-dynamic';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function dayKey(value: string | null): string | null {
  return value && DAY_RE.test(value) ? value : null;
}

/**
 * Contexto de las muertes del jugador en una ventana: dónde cae, con qué lo
 * matan y las señales objetivas para interpretar el por qué.
 *
 *   ?date=YYYY-MM-DD            un día
 *   ?days=N                     los últimos N días (por defecto 1)
 *   ?from=YYYY-MM-DD&to=...     rango explícito
 *
 * Las partidas salen del archivo acumulativo (mismo camino que el resumen), así
 * que no gasta cuota de Henrik.
 */
export async function GET(req: NextRequest) {
  const viewer = viewerFromRequest(req);
  if (!viewer) return Response.json({ error: 'No autenticado', code: 'UNAUTHORIZED' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const player = sp.get('player');
  const access = profileAccess(player, viewer);
  if (access === 'forbidden') {
    return Response.json({ error: 'Ese perfil no es tuyo', code: 'FORBIDDEN' }, { status: 403 });
  }

  const date = dayKey(sp.get('date'));
  const days = Math.min(90, Math.max(1, Number(sp.get('days') ?? '') || 1));
  const today = isoDayLocal(Date.now());
  const from = date ?? dayKey(sp.get('from')) ?? isoDayLocal(Date.now() - (days - 1) * 86_400_000);
  const to = date ?? dayKey(sp.get('to')) ?? today;

  try {
    const profile = orderedProfiles(player, viewer)[0];
    const targets: DeathTarget[] = [];
    const seen = new Set<string>();

    for (const acct of memberAccounts(profile)) {
      const acc = await getHenrikAccount(acct.name, acct.tag).catch(() => null);
      if (!acc?.puuid) continue;
      const matches: DeathMatchInput[] = [];
      for (const m of getArchiveMatches(acct.name, acct.tag)) {
        const id = henrikMatchId(m);
        if (!id || seen.has(id)) continue;
        // Mismo criterio que el resumen: competitivas terminadas y jugadas por
        // esta cuenta (el archivo es competitivo, pero el filtro no estorba).
        if ((m.metadata?.queue?.id ?? '').toLowerCase() !== 'competitive') continue;
        if (m.metadata?.is_completed === false) continue;
        if (!(m.players ?? []).some((p) => p.puuid === acc.puuid)) continue;
        const ts = henrikMatchTimestamp(m);
        const day = isoDayLocal(ts);
        if (day < from || day > to) continue;
        seen.add(id);
        matches.push({ matchId: id, match: m, startedAt: ts });
      }
      if (matches.length) targets.push({ puuid: acc.puuid, matches });
    }

    const report = await buildDeathReport(targets, profile.id, { from, to });
    return Response.json(report, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const code = (err as { code?: string })?.code ?? 'HTTP';
    return Response.json(
      { error: err instanceof Error ? err.message : String(err), code },
      { status: 404 },
    );
  }
}
