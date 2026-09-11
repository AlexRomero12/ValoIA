import { NextRequest } from 'next/server';
import { deleteProfile, listProfilesFor, scopeProfiles, upsertProfile, type UpsertProfileInput } from '@/lib/profiles';
import { viewerFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const viewer = viewerFromRequest(req);
  if (!viewer) return Response.json({ error: 'No autenticado', code: 'UNAUTHORIZED' }, { status: 401 });
  try {
    return Response.json({ profiles: listProfilesFor(viewer) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

/**
 * Acciones:
 *  - { action: 'upsert', profile }  crea (sin id) o actualiza (con id, solo del dueño)
 *  - { action: 'delete', id }       borra (solo del dueño)
 */
export async function POST(req: NextRequest) {
  const viewer = viewerFromRequest(req);
  if (!viewer) return Response.json({ error: 'No autenticado', code: 'UNAUTHORIZED' }, { status: 401 });

  let body: { action?: string; profile?: UpsertProfileInput; id?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  try {
    if (body.action === 'upsert') {
      if (!body.profile) return Response.json({ error: 'Falta profile' }, { status: 400 });
      const profiles = upsertProfile(body.profile, viewer);
      return Response.json({ ok: true, profiles: scopeProfiles(profiles, viewer) });
    }
    if (body.action === 'delete') {
      if (!body.id) return Response.json({ error: 'Falta id' }, { status: 400 });
      const profiles = deleteProfile(body.id, viewer);
      return Response.json({ ok: true, profiles: scopeProfiles(profiles, viewer) });
    }
    return Response.json({ error: 'Acción desconocida (upsert | delete)' }, { status: 400 });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    const status = code === 'FORBIDDEN' ? 403 : 400;
    return Response.json({ error: err instanceof Error ? err.message : String(err), code }, { status });
  }
}
