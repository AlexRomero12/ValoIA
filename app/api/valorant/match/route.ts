import { NextRequest } from 'next/server';
import { getMatchDetail } from '@/lib/matchDetail';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const id = sp.get('id')?.trim();
  if (!id) return Response.json({ error: 'Falta id de partida', code: 'BAD_REQUEST' }, { status: 400 });
  const player = sp.get('player');
  try {
    const detail = await getMatchDetail(id, player);
    return Response.json(detail, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const code = (err as { code?: string })?.code ?? 'HTTP';
    return Response.json(
      { error: err instanceof Error ? err.message : String(err), code },
      { status: 404 },
    );
  }
}
