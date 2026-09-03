import { NextRequest } from 'next/server';
import { getAuditHistory, upsertAuditDays } from '@/lib/auditHistoryStore';
import type { StoredAuditDay } from '@/lib/auditHistory';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const days = await getAuditHistory();
    return Response.json({ days }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: { days?: StoredAuditDay[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body JSON inválido' }, { status: 400 });
  }
  const days = Array.isArray(body?.days) ? body.days : [];
  if (!days.length) {
    return Response.json({ error: 'Falta days[]' }, { status: 400 });
  }
  try {
    const saved = await upsertAuditDays(days);
    return Response.json({ ok: true, days: saved });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}