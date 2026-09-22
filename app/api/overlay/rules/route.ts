import type { NextRequest } from 'next/server';
import { overlayError, overlayGate, overlayJson, overlayOptions, resolveOverlayProfile } from '@/lib/overlay';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return overlayOptions();
}

/**
 * GET /api/overlay/rules?player=
 * Pool por mapa, prohibidos, regla de parada, pausa de sesión y metas
 * del perfil principal (o ?player=). Solo lectura, sin auth.
 */
export async function GET(req: NextRequest) {
  const gate = overlayGate(req);
  if (!gate.ok) return gate.res;

  const playerParam = req.nextUrl.searchParams.get('player')?.trim() || undefined;
  const profile = resolveOverlayProfile(playerParam);
  if (!profile) {
    return overlayError('NO_PROFILES', 'No hay perfiles configurados', 404);
  }

  const rules = profile.rules;
  return overlayJson({
    profile: { id: profile.id, label: profile.label, name: profile.name, tag: profile.tag },
    rulesVersion: rules?.rulesVersion ?? 0,
    hasRules: Boolean(rules),
    pool: {
      byMap: rules?.pool.byMap ?? {},
      default: rules?.pool.default ?? null,
    },
    bannedAgents: rules?.bannedAgents ?? [],
    bannedRoles: rules?.bannedRoles ?? [],
    stop: { losses: rules?.stop.losses ?? 2, kdBelow: rules?.stop.kdBelow ?? 0.9 },
    sessions: { gapMinutes: rules?.sessions.gapMinutes ?? 180 },
    goals: rules?.goals ?? {},
  });
}
