import { env } from './env';

/**
 * Modo de la aplicación:
 *  - `single`: instancia personal (AlexRomero12#LAN), sin login. Es el modo por
 *    defecto y el que corre tu docker local en :4322.
 *  - `public`: producto público para la solicitud de production key de Riot:
 *    cuentas locales + vinculación Riot (RSO) + consentimiento de opt-in.
 */
export type AppMode = 'single' | 'public';

export function appMode(): AppMode {
  return env('APP_MODE', 'single').toLowerCase() === 'public' ? 'public' : 'single';
}

export function isPublicMode(): boolean {
  return appMode() === 'public';
}
