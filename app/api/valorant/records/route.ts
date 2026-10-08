import { NextRequest } from 'next/server';
import { getHenrikAccolades } from '@/lib/henrik';
import { recordsFrom } from '@/lib/records';
import { resolveProfileAccount } from '@/lib/profileAccount';
import { getProvider } from '@/lib/valorant';

export const dynamic = 'force-dynamic';

/**
 * Récords/PBs de una cuenta (accolades de Riot, v4.10).
 *
 * Se pide on-demand (no entra en el warmup) y va cacheado 6 h en `lib/henrik`,
 * así que abrir la pestaña varias veces no gasta cuota.
 */
export async function GET(req: NextRequest) {
  const resolved = resolveProfileAccount(req);
  if (!resolved.ok) return Response.json(resolved.body, { status: resolved.status });
  if (getProvider() !== 'henrik') {
    return Response.json(
      { error: 'Los récords necesitan el proveedor Henrik (HENRIK_API_KEY)', code: 'PROVIDER_UNSUPPORTED' },
      { status: 409 },
    );
  }

  const { name, tag } = resolved.value;
  try {
    const acc = await getHenrikAccolades(name, tag);
    const records = recordsFrom(acc, acc.account?.puuid ?? null);
    if (!records) {
      return Response.json(
        { error: 'Riot todavía no publica récords para esta cuenta', code: 'NO_RECORDS' },
        { status: 404 },
      );
    }
    return Response.json(records, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const code = (err as { code?: string })?.code ?? 'HTTP';
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message, code }, { status: 500 });
  }
}
