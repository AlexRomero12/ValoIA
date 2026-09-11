import { auditDay, mondayOf } from './audit';
import { getValSummary } from './valorant';
import { getStorePrimaryProfile } from './profiles';
import { getSubscriptions, pushEnabled, sendPush } from './push';
import { readData, writeData } from './persist';
import { adminUsername } from './auth';
import type { MatchRow } from './types';

/**
 * Aviso semanal de auditoría (lo ejecuta el cron de instrumentation.ts):
 * cuando la semana anterior ya terminó, calcula para el PERFIL PRINCIPAL sus
 * cortes ignorados y violaciones de pool, y manda UN push resumen con
 * hallazgos. Dedupe en `data/audit-notified.json` (una vez por semana).
 *
 * Se puede apagar con VAL_AUDIT_PUSH=0.
 */

interface NotifiedFile {
  /** lunes (YYYY-MM-DD) de la semana ya notificada */
  week: string;
  sentAt: number;
}

const NOTIFIED_FILE = 'audit-notified.json';
const READY_HOUR = 9;

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtRR(v: number | null): string {
  if (v == null) return '—';
  return `${v > 0 ? '+' : ''}${v}`;
}

export interface AuditWatchResult {
  checked: boolean;
  week: string | null;
  sent: number;
  failed: number;
  skipped: string;
}

/**
 * Comprueba si la semana pasada está lista para notificar y, si no se avisó
 * aún, envía el resumen. Corre desde el cron; es idempotente por semana.
 */
export async function watchWeeklyAudit(now = Date.now()): Promise<AuditWatchResult> {
  if (process.env.VAL_AUDIT_PUSH === '0') {
    return { checked: false, week: null, sent: 0, failed: 0, skipped: 'VAL_AUDIT_PUSH=0' };
  }
  if (!pushEnabled()) {
    return { checked: false, week: null, sent: 0, failed: 0, skipped: 'push no configurado' };
  }
  const target = getStorePrimaryProfile();
  if (!target) {
    return { checked: false, week: null, sent: 0, failed: 0, skipped: 'sin perfiles' };
  }
  const owner = target.owner ?? adminUsername() ?? '';
  if (getSubscriptions(owner).length === 0) {
    return { checked: false, week: null, sent: 0, failed: 0, skipped: 'sin suscripciones push' };
  }

  // Semana anterior completa: lunes de la semana pasada.
  const lastMonday = new Date(mondayOf(now).getTime() - 7 * 86_400_000);
  const week = dayKey(lastMonday.getTime());
  const readyAt = lastMonday.getTime() + 7 * 86_400_000 + READY_HOUR * 3_600_000;
  if (now < readyAt) {
    return { checked: false, week, sent: 0, failed: 0, skipped: 'semana aún no terminada' };
  }

  const notified = readData<NotifiedFile>(NOTIFIED_FILE, { week: '', sentAt: 0 });
  if (notified.week === week) {
    return { checked: false, week, sent: 0, failed: 0, skipped: 'ya notificada' };
  }

  const weekEnd = lastMonday.getTime() + 7 * 86_400_000;
  const profile = getStorePrimaryProfile();
  if (!profile) {
    return { checked: false, week, sent: 0, failed: 0, skipped: 'sin perfiles' };
  }
  const daysBack = Math.min(30, Math.ceil((now - lastMonday.getTime()) / 86_400_000) + 1);

  let matches: MatchRow[] = [];
  try {
    const summary = await getValSummary({ days: daysBack, playerId: profile.id, maxFetch: 40 });
    matches = (summary.matches ?? []).filter((m) => m.timestamp >= lastMonday.getTime() && m.timestamp < weekEnd);
  } catch (e) {
    console.error(`[audit] ${profile.label}: ${e instanceof Error ? e.message : String(e)}`);
    writeData(NOTIFIED_FILE, { week, sentAt: Date.now() });
    return { checked: true, week, sent: 0, failed: 0, skipped: 'error al cargar partidas' };
  }

  if (matches.length === 0) {
    writeData(NOTIFIED_FILE, { week, sentAt: Date.now() });
    return { checked: true, week, sent: 0, failed: 0, skipped: 'sin partidas' };
  }

  const byDay = new Map<string, MatchRow[]>();
  for (const m of matches) {
    const k = dayKey(m.timestamp);
    const list = byDay.get(k) ?? [];
    list.push(m);
    byDay.set(k, list);
  }

  let cutIgnored = 0;
  let violations = 0;
  let banned = 0;
  let rrReal = 0;
  let poolLoss = 0;
  for (const list of byDay.values()) {
    const day = auditDay(list, profile.audit);
    if (day.cutIgnored) cutIgnored += 1;
    violations += day.violationCount;
    banned += day.bannedCount;
    rrReal += day.realRR ?? 0;
    poolLoss += day.violationLoss ?? 0;
  }

  const findings: string[] = [];
  if (cutIgnored > 0) findings.push(`${cutIgnored} corte(s) ignorado(s)`);
  if (violations > 0) findings.push(`${violations} fuera de pool (${fmtRR(poolLoss)} RR)${banned ? ` · ${banned} prohibidos` : ''}`);

  if (findings.length === 0) {
    writeData(NOTIFIED_FILE, { week, sentAt: Date.now() });
    return { checked: true, week, sent: 0, failed: 0, skipped: 'sin hallazgos' };
  }

  const wins = matches.filter((m) => m.won && m.roundsWon !== m.roundsLost).length;
  const draws = matches.filter((m) => m.roundsWon === m.roundsLost).length;
  const losses = matches.length - wins - draws;
  const record = `${wins}-${losses}${draws ? `-${draws}E` : ''}`;

  const res = await sendPush(
    {
      title: `Auditoría semanal · ${profile.label}`,
      body: `${record} en ${matches.length}p · ${fmtRR(Math.round(rrReal))} RR · ${findings.join(' · ')}`,
      url: '/auditoria',
    },
    owner,
  );

  writeData(NOTIFIED_FILE, { week, sentAt: Date.now() });
  return { checked: true, week, sent: res.sent, failed: res.failed, skipped: '' };
}
