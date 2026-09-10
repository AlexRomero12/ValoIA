import { NextRequest } from 'next/server';
import { createRequest, MAX_MESSAGE } from '@/lib/accessRequests';
import { validateUsername } from '@/lib/auth';
import { logAuth } from '@/lib/authLog';
import { clientIp } from '@/lib/clientIp';
import { rateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * Solicitud pública de acceso (sin cuenta). Rate-limit por IP; respuesta
 * genérica para no filtrar si el usuario existe.
 */
export async function POST(req: NextRequest) {
  let body: { username?: unknown; message?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const username = String(body.username ?? '').trim();
  const message = String(body.message ?? '').trim().slice(0, MAX_MESSAGE);
  const err = validateUsername(username);
  if (err) return Response.json({ error: err }, { status: 400 });

  const ip = clientIp(req);
  const hourly = rateLimit(`access:ip:${ip}`, 3, 60 * 60_000);
  const daily = rateLimit(`access:day:${ip}`, 10, 24 * 60 * 60_000);
  if (!hourly.ok || !daily.ok) {
    const retry = Math.max(hourly.retryAfterSec ?? 0, daily.retryAfterSec ?? 0);
    return Response.json(
      { error: 'Demasiadas solicitudes. Intenta más tarde.' },
      { status: 429, headers: retry ? { 'Retry-After': String(retry) } : undefined },
    );
  }

  createRequest(username.toLowerCase(), message, ip, req.headers.get('user-agent') ?? '');
  logAuth('request_access', { user: username.toLowerCase(), ip });

  return Response.json({
    ok: true,
    message: 'Solicitud enviada. El administrador la revisará y te avisará.',
  });
}
