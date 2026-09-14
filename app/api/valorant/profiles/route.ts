import { NextRequest } from 'next/server';
import {
  listProfilesFor,
  listPublicProfilesFor,
  scopeProfiles,
  upsertProfile,
  type UpsertProfileInput,
} from '@/lib/profiles';
import { getUser } from '@/lib/auth';
import { viewerOrSingle } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Perfiles propios. Con `?viewable=1` se añaden los perfiles públicos de otros
 * usuarios (opt-in vigente) marcados como solo lectura: así Ranked/Equipo
 * pueden comparar sin exponer datos de quien no consintió.
 */
export async function GET(req: NextRequest) {
  const viewer = viewerOrSingle(req);
  if (!viewer) return Response.json({ error: 'No autenticado', code: 'UNAUTHORIZED' }, { status: 401 });
  try {
    const own = listProfilesFor(viewer);
    if (req.nextUrl.searchParams.get('viewable') !== '1') {
      return Response.json({ profiles: own }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const seen = new Set(own.map((p) => p.id));
    const others = listPublicProfilesFor(viewer)
      .filter((p) => !seen.has(p.id))
      .map((p) => ({ ...p, publicRead: true, ownerName: getUser(p.owner ?? '')?.username ?? p.owner, rules: undefined }));
    return Response.json({ profiles: [...own, ...others] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

/**
 * Acción única: { action: 'upsert', profile } guarda el perfil del usuario.
 * El Riot ID solo se cambia vinculando la cuenta de Riot (RSO/mock).
 */
export async function POST(req: NextRequest) {
  const viewer = viewerOrSingle(req);
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
      const { deleteProfile } = await import('@/lib/profiles');
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
