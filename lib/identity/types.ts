import { env } from '../env';

/**
 * Proveedores de vinculación con Riot.
 *
 * - `mock` (pre-aprobación): simula el resultado de RSO con la cuenta del
 *   entorno; permite construir y probar todo el flujo de opt-in/visibilidad.
 * - `rso` (post-aprobación): flujo OAuth2 authorization-code real con el
 *   client_id/secret que Riot entrega tras aprobar la production key.
 */

export interface LinkedIdentity {
  gameName: string;
  tagLine: string;
  puuid: string;
  mock: boolean;
}

export type LinkStart =
  | { kind: 'linked'; identity: LinkedIdentity }
  | { kind: 'redirect'; url: string };

export interface IdentityProvider {
  id: 'mock' | 'rso';
  startLink(input: { username: string; gameName?: string; tagLine?: string; origin: string }): Promise<LinkStart>;
  handleCallback(input: { code: string; state: string; origin: string }): Promise<{ username: string; identity: LinkedIdentity }>;
}

export function rsoEnabled(): boolean {
  return env('RSO_ENABLED', '0') === '1' && Boolean(env('RSO_CLIENT_ID')) && Boolean(env('RSO_CLIENT_SECRET'));
}
