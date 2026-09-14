import { randomBytes } from 'node:crypto';
import { env } from '../env';
import { readData, writeDataSync } from '../persist';
import { RIOT_CONFIG } from '../riot/client';
import type { IdentityProvider, LinkStart, LinkedIdentity } from './types';

/**
 * Proveedor RSO real (Riot Sign-On, OAuth2 authorization-code).
 *
 * Se habilita con RSO_ENABLED=1 + RSO_CLIENT_ID/RSO_CLIENT_SECRET (credenciales
 * que Riot entrega al aprobar la production key). Los `state` viven en
 * `data/rso-states.json` (10 min de vigencia, un solo uso).
 */

const AUTH_BASE = 'https://auth.riotgames.com';
const STATE_TTL_MS = 10 * 60 * 1000;

interface StateFile {
  version: number;
  states: Record<string, { username: string; createdAt: number }>;
}

const STATES_FILE = 'rso-states.json';

function readStates(): StateFile {
  return readData<StateFile>(STATES_FILE, { version: 1, states: {} });
}

function writeStates(file: StateFile): void {
  writeDataSync(STATES_FILE, file);
}

function redirectUri(origin: string): string {
  return env('RSO_REDIRECT_URI', `${origin}/api/riot/link/callback`);
}

export const rsoProvider: IdentityProvider = {
  id: 'rso',

  async startLink({ username, origin }): Promise<LinkStart> {
    const clientId = env('RSO_CLIENT_ID');
    if (!clientId) throw new Error('Falta RSO_CLIENT_ID');

    const state = randomBytes(24).toString('base64url');
    const file = readStates();
    const now = Date.now();
    // Purga estados viejos y guarda el nuevo (un solo uso).
    const states: StateFile['states'] = {};
    for (const [k, v] of Object.entries(file.states)) {
      if (now - v.createdAt < STATE_TTL_MS) states[k] = v;
    }
    states[state] = { username, createdAt: now };
    writeStates({ version: 1, states });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri(origin),
      response_type: 'code',
      scope: 'openid offline_access account',
      state,
      nonce: randomBytes(12).toString('base64url'),
      ui_locales: 'es-ES en-US',
    });
    return { kind: 'redirect', url: `${AUTH_BASE}/authorize?${params}` };
  },

  async handleCallback({ code, state, origin }): Promise<{ username: string; identity: LinkedIdentity }> {
    const clientId = env('RSO_CLIENT_ID');
    const clientSecret = env('RSO_CLIENT_SECRET');
    if (!clientId || !clientSecret) throw new Error('Faltan credenciales RSO');

    const file = readStates();
    const record = file.states[state];
    if (!record || Date.now() - record.createdAt > STATE_TTL_MS) {
      throw Object.assign(new Error('state inválido o expirado'), { code: 'BAD_STATE' });
    }
    const nextStates = { ...file.states };
    delete nextStates[state];
    writeStates({ version: 1, states: nextStates });

    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenRes = await fetch(`${AUTH_BASE}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri(origin),
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!tokenRes.ok) {
      throw Object.assign(new Error(`RSO token HTTP ${tokenRes.status}`), { code: 'TOKEN_HTTP' });
    }
    const tokens = (await tokenRes.json()) as { access_token?: string };
    if (!tokens.access_token) throw Object.assign(new Error('RSO sin access_token'), { code: 'TOKEN_EMPTY' });

    const meRes = await fetch(`https://${RIOT_CONFIG.cluster()}.api.riotgames.com/riot/account/v1/accounts/me`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!meRes.ok) throw Object.assign(new Error(`RSO userinfo HTTP ${meRes.status}`), { code: 'USERINFO_HTTP' });
    const me = (await meRes.json()) as { puuid?: string; gameName?: string; tagLine?: string };
    if (!me.puuid) throw Object.assign(new Error('RSO sin puuid'), { code: 'USERINFO_EMPTY' });

    return {
      username: record.username,
      identity: {
        gameName: me.gameName ?? record.username,
        tagLine: me.tagLine ?? '',
        puuid: me.puuid,
        mock: false,
      },
    };
  },
};
