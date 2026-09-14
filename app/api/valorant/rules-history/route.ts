import { NextRequest } from 'next/server';
import { getRulesHistory, upsertRulesDays } from '@/lib/rulesHistoryStore';
import type { StoredRulesDay } from '@/lib/rulesHistory';
import { listViewableProfilesFor } from '@/lib/profiles';
import { viewerOrSingle } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** Solo los snapshots de perfiles visibles para el visor. */
function allowedPrefixes(req: NextRequest): Set<string> | null {
  const viewer = viewerOrSingle(req);
  if (!viewer) return null;
  return new Set(listViewableProfilesFor(viewer).map((p) => p.id));
}

export async function GET(req: NextRequest) {
  const allowed = allowedPrefixes(req);
  if (!allowed) return Response.json({ error: 'No autenticado', code: 'UNAUTHORIZED' }, { status: 401 });
  try {
    const all = await getRulesHistory();
    const days = Object.fromEntries(Object.entries(all).filter(([key]) => allowed.has(key.split(':')[0])));
    return Response.json({ days }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const allowed = allowedPrefixes(req);
  if (!allowed) return Response.json({ error: 'No autenticado', code: 'UNAUTHORIZED' }, { status: 401 });

  let body: { days?: StoredRulesDay[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body JSON inválido' }, { status: 400 });
  }
  const days = (Array.isArray(body?.days) ? body.days : []).filter(
    (d) => d && d.key && allowed.has(String(d.profileId ?? d.key.split(':')[0])),
  );
  if (!days.length) {
    return Response.json({ error: 'Falta days[] (o no tienes permiso sobre esos perfiles)' }, { status: 400 });
  }
  try {
    const saved = await upsertRulesDays(days);
    return Response.json({ ok: true, days: saved });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
