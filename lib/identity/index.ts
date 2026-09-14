import { mockProvider } from './mock';
import { rsoProvider } from './rso';
import { rsoEnabled, type IdentityProvider, type LinkedIdentity } from './types';
import { upsertProfile } from '../profiles';

export type { IdentityProvider, LinkedIdentity } from './types';
export { rsoEnabled } from './types';

/** Proveedor activo: RSO real si hay credenciales; si no, demo. */
export function identityProvider(): IdentityProvider {
  return rsoEnabled() ? rsoProvider : mockProvider;
}

/**
 * Refleja la identidad vinculada en el perfil del usuario (id = username).
 * En modo público el perfil nace aquí (no se siembran perfiles del `.env`).
 */
export function syncRiotProfile(username: string, identity: LinkedIdentity): void {
  try {
    upsertProfile(
      {
        id: username,
        label: identity.gameName,
        name: identity.gameName,
        tag: identity.tagLine,
        primary: true,
        visible: true,
      },
      { username, admin: false },
    );
  } catch (e) {
    console.error(`[identity] no se pudo sincronizar el perfil de ${username}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
