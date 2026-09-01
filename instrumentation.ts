import { env } from './lib/env';
import { warmAllPlayers } from './lib/warm';
import { watchStoreAndNotify } from './lib/storeWatch';

/**
 * Mantenimiento en background del dashboard (opcional, opt-in):
 *  VAL_BACKGROUND_REFRESH=1  activa el cron
 *  VAL_REFRESH_INTERVAL_MIN=15  (por defecto)
 *
 * Cada ciclo sincroniza el bucket de partidas + MMR de los 4 jugadores,
 * secuencialmente. El sync incremental suele costar 1 request por jugador,
 * así el abrir el dashboard cuesta $0 requests de Henrik. Cada partida nueva
 * detectada también se archiva en el archivo acumulativo (lib/archive.ts),
 * así el historial crece solo aunque el bucket rote a las 40.
 *
 * La tienda diaria se vigila con frecuencia menor (cada 60 min): si hay skins
 * favoritas y suscripciones push, se refresca el storefront (local o RSO) y se
 * notifica cuando una favorita aparece en la tienda (una vez por día por skin).
 */
export function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (env('VAL_BACKGROUND_REFRESH', '0') !== '1') return;

  const intervalMin = Number(env('VAL_REFRESH_INTERVAL_MIN', '15'));
  const intervalMs = Math.max(5, Number.isFinite(intervalMin) && intervalMin > 0 ? intervalMin : 15) * 60_000;

  let running = false;
  const cycle = async () => {
    if (running) return;
    running = true;
    try {
      await warmAllPlayers(40);
    } finally {
      running = false;
    }
  };

  let storeRunning = false;
  const storeCycle = async () => {
    if (storeRunning) return;
    storeRunning = true;
    try {
      const result = await watchStoreAndNotify();
      if (result.checked && result.matches.length > 0) {
        console.log(`[store] ${result.matches.length} favorita(s) en tienda · ${result.sent} push enviado(s)`);
      }
    } catch (e) {
      console.error(`[store] vigilancia falló: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      storeRunning = false;
    }
  };

  // Primer ciclo unos segundos después del arranque (no bloquear el startup)
  // y luego en intervalos fijos.
  setTimeout(() => void cycle(), 30_000);
  setInterval(() => void cycle(), intervalMs);

  // Vigilancia de tienda: cada 60 min (la tienda rota cada 24h, con 1h basta).
  setTimeout(() => void storeCycle(), 45_000);
  setInterval(() => void storeCycle(), 60 * 60 * 1000);
}
