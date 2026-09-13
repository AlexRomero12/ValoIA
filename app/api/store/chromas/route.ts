import { NextRequest } from 'next/server';
import { getSkinVariants } from '@/lib/skins';

export const dynamic = 'force-dynamic';

/** GET ?id=<uuid de nivel o chroma> -> { chromas } de esa skin */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')?.trim();
  if (!id) return Response.json({ chromas: [] });
  try {
    const variants = await getSkinVariants(id);
    return Response.json(
      {
        chromas: variants?.chromas ?? [],
        baseName: variants?.baseName ?? '',
      },
      { headers: { 'Cache-Control': 'private, max-age=3600' } },
    );
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err), chromas: [] },
      { status: 500 },
    );
  }
}
