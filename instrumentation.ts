import { env } from './lib/env';
import { warmAllPlayers } from './lib/warm';
import { watchWeeklyRules } from './lib/rulesWatch';

/**
 * Mantenimiento en background del dashboard (opcional, opt-in):
 *  VAL_BACKGROUND_REFRESH=1  activa el cron
 *  VAL_REFRESH_INTERVAL_MIN=15  (por defecto)
 *
 * Cada ciclo sincroniza las partidas del perfil único (Riot dev + mock o Riot
 * producción), secuencialmente. Cada partida nueva detectada también se archiva
 * en el archivo acumulativo (lib/archive.ts), así el historial crece solo.
 *
 * El aviso semanal de reglas (lunes por la mañana, dedupe semanal) manda un push
 * con cortes ignorados/violaciones de pool (VAL_RULES_PUSH=0 lo apaga).
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

  // Aviso semanal de reglas: revisa cada 60 min y envía una vez por semana.
  let rulesRunning = false;
  const rulesCycle = async () => {
    if (rulesRunning) return;
    rulesRunning = true;
    try {
      const result = await watchWeeklyRules();
      if (result.checked && result.sent > 0) {
        console.log(`[rules] resumen semanal ${result.week}: ${result.sent} push enviado(s)`);
      }
    } catch (e) {
      console.error(`[rules] aviso semanal falló: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      rulesRunning = false;
    }
  };
  setTimeout(() => void rulesCycle(), 90_000);
  setInterval(() => void rulesCycle(), 60 * 60 * 1000);
}
