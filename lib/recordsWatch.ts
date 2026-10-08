import { env } from './env';
import { readData, writeDataSync } from './persist';
import { getHenrikAccolades, type HenrikAccoladeMetric, type HenrikAccolades } from './henrik';
import { improvedRecords, improvedRecordsText } from './records';
import { getSubscriptions, pushEnabled, sendPush } from './push';
import { getStorePrimaryProfile } from './profiles';
import { memberAccounts } from './profileTypes';
import { adminUsername } from './auth';

/**
 * Aviso de récord batido.
 *
 * Patrón idéntico al de `lib/rulesWatch.ts`: se guarda una captura de los
 * mejores valores por cuenta (`records-notified.json` en DATA_DIR, fuera del
 * cache para que borrar `.cache/` no provoque avisos duplicados) y en cada
 * pasada se comparan los récords nuevos contra esa captura.
 *
 * La PRIMERA vez que se ve una cuenta solo se guarda la captura: así el
 * estreno no dispara un push con los 12 récords históricos.
 */

interface AccountBaseline {
  /** `summary.all_time` tal cual lo publica Riot (solo lo comparamos). */
  allTime: HenrikAccoladeMetric[];
  updatedAt: number;
}

interface RecordsState {
  version: number;
  accounts: Record<string, AccountBaseline>;
}

const STATE_FILE = 'records-notified.json';
/** Tope de récords que se enumeran en el cuerpo del aviso. */
const MAX_LISTED = 3;

let mem: RecordsState | null = null;

function load(): RecordsState {
  if (mem) return mem;
  const file = readData<RecordsState>(STATE_FILE, { version: 1, accounts: {} });
  mem = file && typeof file.accounts === 'object' && file.accounts ? file : { version: 1, accounts: {} };
  return mem;
}

export function accountKeyOf(name: string, tag: string): string {
  return `${name}#${tag}`;
}

export interface RecordsWatchResult {
  /** Cuentas consultadas en esta pasada. */
  checked: number;
  /** Cuentas con récord nuevo. */
  improved: number;
  /** Notificaciones entregadas. */
  sent: number;
  /** true = primera captura (no se avisa, solo se guarda la base). */
  baselined: boolean;
  /** Motivo por el que no se hizo nada (para logs). */
  skipped?: string;
}

/** Récords mejorados comparando dos `summary.all_time`. */
export function improvedFromBaseline(
  baseline: HenrikAccoladeMetric[] | null | undefined,
  next: HenrikAccolades,
): ReturnType<typeof improvedRecords> {
  const prev: HenrikAccolades = { summary: { all_time: baseline ?? [] } };
  if (!baseline) return [];
  return improvedRecords(prev, next);
}

export async function watchRecords(): Promise<RecordsWatchResult> {
  const empty: RecordsWatchResult = { checked: 0, improved: 0, sent: 0, baselined: false };
  // Opt-out explícito (mismo criterio que las reglas semanales).
  if ((env('VAL_RECORDS_PUSH', '1') || '1') === '0') return { ...empty, skipped: 'disabled' };
  if (!pushEnabled()) return { ...empty, skipped: 'no-push-config' };

  const target = getStorePrimaryProfile();
  if (!target) return { ...empty, skipped: 'no-profile' };
  const owner = target.owner ?? adminUsername() ?? '';
  if (!getSubscriptions(owner).length) return { ...empty, skipped: 'no-subscriptions' };

  const acc = memberAccounts(target)[0];
  if (!acc) return { ...empty, skipped: 'no-account' };

  let data: HenrikAccolades;
  try {
    data = await getHenrikAccolades(acc.name, acc.tag);
  } catch (err) {
    return { ...empty, skipped: `fetch: ${err instanceof Error ? err.message : String(err)}` };
  }
  const allTime = data.summary?.all_time ?? [];
  if (!allTime.length) return { ...empty, checked: 1, skipped: 'no-accolades' };

  const state = load();
  const key = accountKeyOf(acc.name, acc.tag);
  const prev = state.accounts[key];

  // Primera captura: se guarda y no se avisa (evita el push con todo el historial).
  if (!prev) {
    state.accounts[key] = { allTime, updatedAt: Date.now() };
    mem = state;
    writeDataSync(STATE_FILE, state);
    return { ...empty, checked: 1, baselined: true };
  }

  const improved = improvedFromBaseline(prev.allTime, data);
  // La captura se actualiza SIEMPRE (también cuando el push falle): si no, el
  // próximo ciclo volvería a avisar del mismo récord.
  state.accounts[key] = { allTime, updatedAt: Date.now() };
  mem = state;
  writeDataSync(STATE_FILE, state);

  if (!improved.length) return { ...empty, checked: 1 };

  const res = await sendPush(
    {
      title: improved.length === 1 ? 'Récord batido' : `${improved.length} récords batidos`,
      body: `${acc.name}#${acc.tag} · ${improvedRecordsText(improved, MAX_LISTED)}`,
      url: '/valorant?tab=records',
      tag: 'valoia-records',
    },
    owner,
  );
  return { checked: 1, improved: improved.length, sent: res.sent, baselined: false };
}
