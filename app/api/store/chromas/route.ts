import { NextRequest } from 'next/server';
import { getSkinVariants } from '@/lib/skins';

export const dynamic = 'force-dynamic';

/**
 * GET ?id=<uuid de nivel o chroma> -> niveles y variantes de esa skin.
 * `levels` trae los niveles de evolución (Base, Nivel 2…) con su `video` ingame;
 * `chromas` trae las variantes de color con `fullRender` y `video` si lo tienen.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')?.trim();
  if (!id) return Response.json({ chromas: [], levels: [] });
  try {
    const variants = await getSkinVariants(id);
    return Response.json(
      {
        levels: variants?.levels ?? [],
        chromas: variants?.chromas ?? [],
        baseName: variants?.baseName ?? '',
      },
      { headers: { 'Cache-Control': 'private, max-age=3600' } },
    );
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err), chromas: [], levels: [] },
      { status: 500 },
    );
  }
}
