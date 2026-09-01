import { NextRequest } from 'next/server';
import { getSkinsChromas } from '@/lib/skins';

export const dynamic = 'force-dynamic';

/** GET ?id=<uuid de nivel o chroma> -> variantes (chromas) de esa skin */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')?.trim();
  if (!id) return Response.json({ chromas: [] });
  try {
    const chromas = await getSkinsChromas(id);
    return Response.json({ chromas }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err), chromas: [] }, { status: 500 });
  }
}