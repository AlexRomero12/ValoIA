import type { NextRequest } from 'next/server';
import { refreshPlayer } from '@/lib/refresh';
import { overlayError, overlayGate, overlayJson, overlayOptions, overlayViewer, resolveOverlayProfile } from '@/lib/overlay';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return overlayOptions();
}

/**
 * POST /api/overlay/refresh?player=
 * Sincroniza el bucket/MMR del perfil (post-partida desde el overlay).
 * Fire-and-forget: responde al instante; el widget vuelve a leer en ~20s.
 */
export async function POST(req: NextRequest) {
  const gate = overlayGate(req, { allowPost: true });
  if (!gate.ok) return gate.res;

  const playerParam = req.nextUrl.searchParams.get('player')?.trim() || undefined;
  const profile = resolveOverlayProfile(playerParam);
  if (!profile) {
    return overlayError('NO_PROFILES', 'No hay perfiles configurados', 404);
  }

  try {
    await refreshPlayer(profile.id, 'all', 20, undefined, overlayViewer());
    return overlayJson({ ok: true, player: profile.id, at: new Date().toISOString() });
  } catch (err) {
    const code = (err as { code?: string })?.code ?? 'HTTP';
    return overlayError(code, err instanceof Error ? err.message : String(err), code === 'KEY_MISSING' ? 503 : 500);
  }
}
