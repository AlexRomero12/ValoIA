import type { NextRequest } from 'next/server';
import { getValSummary } from '@/lib/valorant';
import { evaluateDay } from '@/lib/rules';
import {
  isoDayLocal,
  overlayError,
  overlayGate,
  overlayJson,
  overlayOptions,
  overlayViewer,
  resolveOverlayProfile,
} from '@/lib/overlay';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return overlayOptions();
}

/**
 * GET /api/overlay/session?player=
 * Evaluación de hoy (evaluateDay): contador de corte, corte ignorado,
 * sesiones, RR real vs plan y tiempo desde la última partida.
 */
export async function GET(req: NextRequest) {
  const gate = overlayGate(req);
  if (!gate.ok) return gate.res;

  const playerParam = req.nextUrl.searchParams.get('player')?.trim() || undefined;
  const profile = resolveOverlayProfile(playerParam);
  if (!profile) {
    return overlayError('NO_PROFILES', 'No hay perfiles configurados', 404);
  }

  try {
    const summary = await getValSummary({ days: 7, playerId: profile.id, viewer: overlayViewer() });
    const todayKey = isoDayLocal(Date.now());
    const today = (summary.matches ?? []).filter((m) => isoDayLocal(m.timestamp) === todayKey);
    // evaluateDay espera orden cronológico; el summary viene inverso.
    const ordered = [...today].sort((a, b) => a.timestamp - b.timestamp);
    const ev = evaluateDay(ordered, profile.rules);
    const last = ordered[ordered.length - 1] ?? null;

    return overlayJson({
      profile: { id: profile.id, label: profile.label },
      date: todayKey,
      matches: ordered.length,
      counterAfter: ev.matches.length ? ev.matches[ev.matches.length - 1].counterAfter : 0,
      counter: ev.matches.length ? ev.matches[ev.matches.length - 1].counterAfter : 0,
      stopLosses: profile.rules?.stop.losses ?? 2,
      cutAt: ev.cutAt,
      cutIgnored: ev.cutIgnored,
      sessions: ev.sessions,
      realRR: ev.realRR,
      planRR: ev.planRR,
      planPoolRR: ev.planPoolRR,
      violationCount: ev.violationCount,
      bannedCount: ev.bannedCount,
      rrCoverage: ev.rrCoverage,
      rrMissing: ev.rrMissing,
      lastMatchAt: last ? last.timestamp : null,
      secondsSinceLast: last ? Math.max(0, Math.floor((Date.now() - last.timestamp) / 1000)) : null,
      shouldStop: (ev.matches.length ? ev.matches[ev.matches.length - 1].counterAfter : 0) >= (profile.rules?.stop.losses ?? 2),
      // Impacto del día (partidas con kill feed): contexto para la vista de partida.
      fbTotal: ev.fbTotal,
      fdTotal: ev.fdTotal,
      fdHighCount: ev.fdHighCount ?? 0,
      impactMatches: ev.matches.filter((r) => r.match.firstBloods != null && r.match.firstDeaths != null).length,
    });
  } catch (err) {
    const code = (err as { code?: string })?.code ?? 'HTTP';
    return overlayError(code, err instanceof Error ? err.message : String(err), code === 'KEY_MISSING' ? 503 : 500);
  }
}
