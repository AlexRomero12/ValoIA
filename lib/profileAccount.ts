import type { NextRequest } from 'next/server';
import { viewerFromRequest } from './auth';
import { profileAccess, getProfile } from './profiles';
import { memberAccounts } from './profileTypes';

/**
 * Resolución compartida de `?player=` / `?account=` para los endpoints que
 * consultan la API por cuenta (récords, maestría, Premier). Reproduce el
 * contrato de `/api/valorant/summary` (auth, perfil ajeno, índice de cuenta)
 * para que los errores y los permisos sean idénticos en todo el dash.
 */

export interface ResolvedAccount {
  viewer: { username: string; admin: boolean };
  playerId?: string;
  /** Cuenta efectiva (nombre#tag) que se consulta. */
  name: string;
  tag: string;
}

export type ResolveResult =
  | { ok: true; value: ResolvedAccount }
  | { ok: false; status: number; body: { error: string; code: string } };

export function resolveProfileAccount(req: NextRequest): ResolveResult {
  const viewer = viewerFromRequest(req);
  if (!viewer) {
    return { ok: false, status: 401, body: { error: 'No autenticado', code: 'UNAUTHORIZED' } };
  }
  const sp = req.nextUrl.searchParams;
  const playerParam = sp.get('player');
  const access = profileAccess(playerParam, viewer);
  if (access === 'notfound') {
    return { ok: false, status: 400, body: { error: `Perfil desconocido: ${playerParam}`, code: 'BAD_PLAYER' } };
  }
  if (access === 'forbidden') {
    return { ok: false, status: 403, body: { error: 'Ese perfil no es tuyo', code: 'FORBIDDEN' } };
  }
  const playerId = playerParam || undefined;
  const member = getProfile(playerId, viewer);
  if (!member) {
    return { ok: false, status: 404, body: { error: 'No tienes perfiles configurados', code: 'NO_PROFILES' } };
  }

  let name = member.name;
  let tag = member.tag;
  const rawAccount = sp.get('account');
  if (rawAccount != null) {
    const accs = memberAccounts(member);
    const idx = Number(rawAccount);
    if (Number.isInteger(idx) && idx >= 0 && idx < accs.length) {
      name = accs[idx].name;
      tag = accs[idx].tag;
    }
  }
  return { ok: true, value: { viewer, playerId, name, tag } };
}
