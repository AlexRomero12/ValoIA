import { env } from './lib/env';
import { warmAllPlayers } from './lib/warm';

/**
 * Mantenimiento en background del dashboard (opcional, opt-in):
 *  VAL_BACKGROUND_REFRESH=1  activa el cron
 *  VAL_REFRESH_INTERVAL_MIN=15  (por defecto)
 *
 * Cada ciclo sincroniza el bucket de partidas + MMR de los 4 jugadores,
 * secuencialmente. El sync incremental suele costar 1 request por jugador,
 * así el abrir el dashboard cuesta $0 requests de Henrik.
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

  // Primer ciclo unos segundos después del arranque (no bloquear el startup)
  // y luego en intervalos fijos.
  setTimeout(() => void cycle(), 30_000);
  setInterval(() => void cycle(), intervalMs);
}
