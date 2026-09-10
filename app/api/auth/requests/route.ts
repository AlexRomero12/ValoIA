import { randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { decideRequest, getRequest, listRequests, pendingCount } from '@/lib/accessRequests';
import { createUser, isAdmin, sessionFromRequest, validateUsername } from '@/lib/auth';
import { logAuth } from '@/lib/authLog';
import { clientIp } from '@/lib/clientIp';

export const dynamic = 'force-dynamic';

/** Genera una contraseña temporal legible (16 chars base64url). */
function tempPassword(): string {
  return randomBytes(12).toString('base64url');
}

// ---------- Admin: listar solicitudes ----------

export async function GET(req: NextRequest) {
  const session = sessionFromRequest(req);
  if (!session) return Response.json({ error: 'No autenticado', code: 'UNAUTHORIZED' }, { status: 401 });
  if (!isAdmin(session.u)) return Response.json({ error: 'Solo el administrador' }, { status: 403 });
  return Response.json(
    { requests: listRequests(), pending: pendingCount() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

// ---------- Admin: aprobar / rechazar ----------

export async function POST(req: NextRequest) {
  const session = sessionFromRequest(req);
  if (!session) return Response.json({ error: 'No autenticado', code: 'UNAUTHORIZED' }, { status: 401 });
  if (!isAdmin(session.u)) return Response.json({ error: 'Solo el administrador' }, { status: 403 });

  let body: { action?: string; id?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body JSON inválido' }, { status: 400 });
  }
  const id = String(body.id ?? '');
  if (!id) return Response.json({ error: 'Falta id' }, { status: 400 });

  const request = getRequest(id);
  if (!request || request.status !== 'pending') {
    return Response.json({ error: 'Solicitud no encontrada o ya decidida' }, { status: 404 });
  }

  if (body.action === 'reject') {
    decideRequest(id, 'rejected', session.u);
    logAuth('request_reject', { user: session.u, detail: request.username });
    return Response.json({ ok: true, result: 'rejected' });
  }

  if (body.action === 'approve') {
    const userErr = validateUsername(request.username);
    if (userErr) return Response.json({ error: `Usuario inválido: ${userErr}` }, { status: 400 });
    const password = String(body.password ?? '').trim() || tempPassword();
    const result = createUser(request.username, password, {
      createdIp: clientIp(req),
      mustChangePassword: true,
    });
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 400 });
    }
    decideRequest(id, 'approved', session.u);
    logAuth('request_approve', { user: session.u, detail: request.username });
    logAuth('user_create', { user: session.u, ip: clientIp(req), detail: request.username });
    // La temporal se muestra UNA vez para que el admin la comparta.
    return Response.json({ ok: true, result: 'approved', username: request.username, password });
  }

  return Response.json({ error: 'Acción desconocida (approve | reject)' }, { status: 400 });
}
