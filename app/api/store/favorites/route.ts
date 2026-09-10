import { NextRequest } from 'next/server';
import { addFavorite, removeFavorite, getFavorites } from '@/lib/favorites';
import { viewerFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const viewer = viewerFromRequest(req);
  if (!viewer) return Response.json({ error: 'No autenticado', code: 'UNAUTHORIZED' }, { status: 401 });
  const user = viewer.username;

  let body: { action?: string; offerId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body JSON inválido' }, { status: 400 });
  }
  const { action, offerId } = body;
  if (!offerId || typeof offerId !== 'string') {
    return Response.json({ error: 'Falta offerId' }, { status: 400 });
  }
  try {
    if (action === 'add') {
      await addFavorite(user, offerId);
    } else if (action === 'remove') {
      removeFavorite(user, offerId);
    } else {
      return Response.json({ error: 'Acción desconocida (add | remove)' }, { status: 400 });
    }
    const favorites = await getFavorites(user);
    return Response.json({ ok: true, favorites });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
