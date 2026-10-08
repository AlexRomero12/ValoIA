import { NextRequest } from 'next/server';
import { getHenrikAgentMastery } from '@/lib/henrik';
import { masteryFrom } from '@/lib/mastery';
import { resolveProfileAccount } from '@/lib/profileAccount';
import { getProvider } from '@/lib/valorant';

export const dynamic = 'force-dynamic';

/**
 * Maestría de agentes de una cuenta (endpoint de v4.10).
 *
 * On-demand y cacheada 12 h: la maestría sube jugando, no hay motivo para
 * refrescarla en cada carga ni para meterla en el warmup.
 */
export async function GET(req: NextRequest) {
  const resolved = resolveProfileAccount(req);
  if (!resolved.ok) return Response.json(resolved.body, { status: resolved.status });
  if (getProvider() !== 'henrik') {
    return Response.json(
      { error: 'La maestría necesita el proveedor Henrik (HENRIK_API_KEY)', code: 'PROVIDER_UNSUPPORTED' },
      { status: 409 },
    );
  }

  const { name, tag } = resolved.value;
  try {
    const mastery = masteryFrom(await getHenrikAgentMastery(name, tag));
    if (!mastery) {
      return Response.json({ error: 'Sin datos de maestría para esta cuenta', code: 'NO_MASTERY' }, { status: 404 });
    }
    return Response.json(mastery, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const code = (err as { code?: string })?.code ?? 'HTTP';
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message, code }, { status: 500 });
  }
}
