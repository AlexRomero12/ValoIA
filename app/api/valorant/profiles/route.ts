import { NextRequest } from 'next/server';
import { deleteProfile, listProfiles, upsertProfile, type UpsertProfileInput } from '@/lib/profiles';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json({ profiles: listProfiles() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

/**
 * Acciones:
 *  - { action: 'upsert', profile }  crea (sin id) o actualiza (con id)
 *  - { action: 'delete', id }       borra (nunca el último)
 */
export async function POST(req: NextRequest) {
  let body: { action?: string; profile?: UpsertProfileInput; id?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  try {
    if (body.action === 'upsert') {
      if (!body.profile) return Response.json({ error: 'Falta profile' }, { status: 400 });
      const profiles = upsertProfile(body.profile);
      return Response.json({ ok: true, profiles });
    }
    if (body.action === 'delete') {
      if (!body.id) return Response.json({ error: 'Falta id' }, { status: 400 });
      const profiles = deleteProfile(body.id);
      return Response.json({ ok: true, profiles });
    }
    return Response.json({ error: 'Acción desconocida (upsert | delete)' }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
