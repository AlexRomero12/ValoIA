import { NextRequest } from 'next/server';
import { getComments, setComment } from '@/lib/matchComments';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const comments = await getComments();
    return Response.json({ comments }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: { matchId?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body JSON inválido' }, { status: 400 });
  }
  const { matchId, text } = body ?? {};
  if (!matchId || typeof matchId !== 'string') {
    return Response.json({ error: 'Falta matchId' }, { status: 400 });
  }
  if (typeof text !== 'string') {
    return Response.json({ error: 'Falta text' }, { status: 400 });
  }
  try {
    const comments = await setComment(matchId, text);
    return Response.json({ ok: true, comments });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}