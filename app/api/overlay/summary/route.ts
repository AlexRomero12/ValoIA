import type { NextRequest } from 'next/server';
import { getValSummary } from '@/lib/valorant';
import { formOf } from '@/lib/form';
import { tierName, tierShort } from '@/lib/ranks';
import { overlayError, overlayGate, overlayJson, overlayOptions, overlayViewer, resolveOverlayProfile } from '@/lib/overlay';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return overlayOptions();
}

/**
 * GET /api/overlay/summary?player=&days=30
 * Recorte de getValSummary para el overlay: rango, KPIs, forma y tops.
 * Solo lectura, sin auth, solo loopback/LAN (ver lib/overlay.ts).
 */
export async function GET(req: NextRequest) {
  const gate = overlayGate(req);
  if (!gate.ok) return gate.res;

  const sp = req.nextUrl.searchParams;
  const rawDays = Number(sp.get('days') ?? '');
  const days = Number.isFinite(rawDays) && rawDays >= 1 && rawDays <= 90 ? Math.floor(rawDays) : 30;
  const playerParam = sp.get('player')?.trim() || undefined;

  const profile = resolveOverlayProfile(playerParam);
  if (!profile) {
    return overlayError('NO_PROFILES', 'No hay perfiles configurados', 404);
  }

  try {
    const summary = await getValSummary({ days, playerId: profile.id, viewer: overlayViewer() });
    const form = formOf(summary.matches ?? []);
    const last5 = (summary.matches ?? []).slice(0, 5).map((m) => ({
      matchId: m.matchId,
      date: m.date,
      map: m.map,
      agent: m.agent,
      won: m.won,
      roundsWon: m.roundsWon,
      roundsLost: m.roundsLost,
      kills: m.kills,
      deaths: m.deaths,
      acs: m.acs,
      rrDelta: m.rrDelta ?? null,
    }));
    const topAgent = [...(summary.byAgent ?? [])].sort((a, b) => b.matches - a.matches)[0] ?? null;
    const topMap = [...(summary.byMap ?? [])].sort((a, b) => b.matches - a.matches)[0] ?? null;
    const byMap = (summary.byMap ?? []).map((m) => ({ map: m.map, matches: m.matches, wr: m.wr }));

    return overlayJson({
      profile: { id: profile.id, label: profile.label, name: profile.name, tag: profile.tag },
      generatedAt: summary.generatedAt,
      window: {
        days,
        fetchedMatches: summary.window.fetchedMatches,
        consideredMatches: summary.window.consideredMatches,
      },
      currentTier: summary.currentTier,
      currentTierName: tierName(summary.currentTier),
      currentTierShort: tierShort(summary.currentTier),
      startTier: summary.startTier,
      currentRR: summary.currentRR ?? null,
      currentElo: summary.currentElo ?? null,
      kpis: summary.kpis,
      prev: summary.prev ?? null,
      form,
      last5,
      topAgent: topAgent ? { agent: topAgent.agent, matches: topAgent.matches, wr: topAgent.wr, kd: topAgent.kd, acs: topAgent.acs } : null,
      topMap: topMap ? { map: topMap.map, matches: topMap.matches, wr: topMap.wr } : null,
      byMap,
    });
  } catch (err) {
    const code = (err as { code?: string })?.code ?? 'HTTP';
    return overlayError(code, err instanceof Error ? err.message : String(err), code === 'KEY_MISSING' ? 503 : 500);
  }
}
