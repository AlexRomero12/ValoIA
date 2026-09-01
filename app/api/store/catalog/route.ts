import { NextRequest } from 'next/server';
import { searchSkins, getSkinsByWeapon } from '@/lib/skins';

export const dynamic = 'force-dynamic';

/** ?weapon=Vandal -> todas las skins base del arma | ?q=texto -> búsqueda */
export async function GET(req: NextRequest) {
  const weapon = req.nextUrl.searchParams.get('weapon')?.trim();
  const q = req.nextUrl.searchParams.get('q')?.trim();
  try {
    if (weapon) {
      const results = await getSkinsByWeapon(weapon);
      return Response.json({ results }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (q) {
      const results = await searchSkins(q, 24);
      return Response.json({ results }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return Response.json({ results: [] });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err), results: [] }, { status: 500 });
  }
}