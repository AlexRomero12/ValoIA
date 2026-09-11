'use client';

import { useMemo, useState } from 'react';
import type { MatchRow } from '@/lib/types';
import type { AuditDay } from '@/lib/audit';
import { cloneAuditRules, poolRuleFor, type AuditRules, type Profile } from '@/lib/profileTypes';

interface AuditRecommendationsProps {
  profile: Profile;
  rules?: AuditRules;
  /** Partidas del ámbito (semana actual o semana pasada concreta). */
  matches: MatchRow[];
  /** Días auditados del ámbito (incluye snapshots sin detalle). */
  days: AuditDay[];
  onApply: (next: AuditRules) => Promise<void>;
  onConfigure: () => Promise<void>;
  /** Texto del ámbito, p. ej. "semana actual" o "semana del 1 · 9" */
  scopeLabel?: string;
  /** true = sin tarjeta propia (para incrustar en la tabla de semanas) */
  embedded?: boolean;
}

interface Suggestion {
  id: string;
  tone: 'bad' | 'warn' | 'info' | 'good';
  title: string;
  detail: string;
  action?: { label: string; run: () => void };
}

const MIN_GAMES = 5;
const MAIN_LOW_WR = 45;
const BACKUP_HIGH_WR = 60;
const MAX_SUGGESTIONS = 8;

function fmtRR(v: number): string {
  return `${v > 0 ? '+' : ''}${v}`;
}

/**
 * Recomendaciones de auditoría calculadas con datos ya cargados ($0 requests):
 * violaciones recurrentes, cortes ignorados, reglas vs datos (subir/bajar
 * agente), metas y mapas jugados sin regla. Todo se limita al ámbito recibido
 * (semana actual arriba; semanas pasadas dentro de su "Ver más").
 */
export function AuditRecommendations({
  profile,
  rules,
  matches,
  days,
  onApply,
  onConfigure,
  scopeLabel = 'semana actual',
  embedded = false,
}: AuditRecommendationsProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const suggestions = useMemo<Suggestion[]>(() => {
    const out: Suggestion[] = [];
    if (!rules) {
      out.push({
        id: 'nopool',
        tone: 'warn',
        title: 'Sin pool configurado',
        detail: 'Define principales, backups y prohibidos para auditar la disciplina de pick de este perfil.',
        action: {
          label: 'Configurar',
          run: () => {
            void onConfigure();
          },
        },
      });
    }

    // 1) Violaciones recurrentes
    const byPair = new Map<string, { agent: string; map: string; count: number; rr: number; lastTs: number }>();
    for (const d of days) {
      for (const r of d.matches) {
        if (!r.violation) continue;
        const key = `${r.match.agent} @ ${r.match.map}`;
        const item = byPair.get(key) ?? { agent: r.match.agent, map: r.match.map, count: 0, rr: 0, lastTs: 0 };
        item.count += 1;
        item.rr += r.match.rrDelta ?? 0;
        item.lastTs = Math.max(item.lastTs, r.match.timestamp);
        byPair.set(key, item);
      }
    }
    const violations = [...byPair.values()].sort((a, b) => a.rr - b.rr || b.count - a.count);
    for (const v of violations.slice(0, 2)) {
      const when = v.lastTs
        ? new Date(v.lastTs).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        : '';
      out.push({
        id: `viol-${v.agent}-${v.map}`,
        tone: v.rr < 0 ? 'bad' : 'warn',
        title: `${v.agent} en ${v.map}: ${v.count} violación(es)`,
        detail: `Balance de RR en esas partidas: ${fmtRR(v.rr)}${when ? ` · última el ${when}` : ''}. Revisa la regla del mapa o deja ese pick fuera.`,
      });
    }

    // 2) Cortes ignorados: RR evitable (por totales del día, funciona con snapshots)
    const cutDays = days.filter((d) => d.cutIgnored);
    if (cutDays.length > 0) {
      let evitable = 0;
      let count = 0;
      for (const d of cutDays) {
        if (d.realRR != null && d.planRR != null) {
          evitable += d.realRR - d.planRR;
          count += 1;
        }
      }
      out.push({
        id: 'cuts',
        tone: 'bad',
        title: `${cutDays.length} corte(s) ignorado(s)`,
        detail:
          count > 0
            ? `Jugar después del corte sumó ${fmtRR(evitable)} RR. Respetar la pausa te habría ahorrado ese saldo.`
            : 'Se jugó después del corte en al menos una sesión; no hay RR disponible para calcular el saldo.',
      });
    }

    // 3) Reglas vs datos: el main flojo o el backup fuerte
    const playedMaps = new Set(matches.map((m) => m.map));
    for (const map of playedMaps) {
      const rule = poolRuleFor(rules, map);
      if (!rule) continue;
      for (const agent of rule.main) {
        const st = wrOf(matches, agent, map);
        if (st.games >= MIN_GAMES && st.wr < MAIN_LOW_WR) {
          const key = `demote-${agent}-${map}`;
          out.push({
            id: key,
            tone: 'warn',
            title: `${agent} (principal en ${map}) va ${st.wr.toFixed(0)}% en ${st.games}p`,
            detail: `Por debajo del ${MAIN_LOW_WR}%. Considera bajarlo a backup y probar otra opción.`,
            action: {
              label: 'Bajar a backup',
              run: () => {
                if (!rules) return;
                const next = cloneAuditRules(rules);
                const current = next.pool.byMap[map] ?? { main: [...rule.main], backup: [...rule.backup] };
                next.pool.byMap[map] = {
                  main: current.main.filter((a) => a !== agent),
                  backup: current.backup.includes(agent) ? current.backup : [...current.backup, agent],
                };
                void onApply(next);
              },
            },
          });
        }
      }
      for (const agent of rule.backup) {
        const st = wrOf(matches, agent, map);
        if (st.games >= MIN_GAMES && st.wr > BACKUP_HIGH_WR && !rule.main.includes(agent)) {
          const key = `promote-${agent}-${map}`;
          out.push({
            id: key,
            tone: 'good',
            title: `${agent} (backup en ${map}) va ${st.wr.toFixed(0)}% en ${st.games}p`,
            detail: `Por encima del ${BACKUP_HIGH_WR}%. Puede subir a principal.`,
            action: {
              label: 'Subir a principal',
              run: () => {
                if (!rules) return;
                const next = cloneAuditRules(rules);
                const current = next.pool.byMap[map] ?? { main: [...rule.main], backup: [...rule.backup] };
                next.pool.byMap[map] = {
                  main: current.main.includes(agent) ? current.main : [...current.main, agent],
                  backup: current.backup.filter((a) => a !== agent),
                };
                void onApply(next);
              },
            },
          });
        }
      }
    }

    // 4) Metas del ámbito (la semana ya viene recortada por el llamador)
    const goals = rules?.goals;
    if (goals && matches.length > 0) {
      const week = matches;
      const wins = week.filter((m) => m.won && m.roundsWon !== m.roundsLost).length;
      const draws = week.filter((m) => m.roundsWon === m.roundsLost).length;
      const decisive = week.length - draws;
      const wr = decisive ? (wins / decisive) * 100 : 0;
      const kd = week.reduce((a, m) => a + m.deaths, 0) ? week.reduce((a, m) => a + m.kills, 0) / week.reduce((a, m) => a + m.deaths, 0) : 0;
      const acs = week.reduce((a, m) => a + m.acs, 0) / week.length;
      const hsPct = week.reduce((a, m) => a + m.hsPct, 0) / week.length;
      const adr = week.reduce((a, m) => a + m.adr, 0) / week.length;
      const items: string[] = [];
      if (goals.wr != null) items.push(`WR ${wr.toFixed(0)}%${wr >= goals.wr ? ' ✓' : ` (meta ${goals.wr}%)`}`);
      if (goals.kd != null) items.push(`K/D ${kd.toFixed(2)}${kd >= goals.kd ? ' ✓' : ` (meta ${goals.kd})`}`);
      if (goals.acs != null) items.push(`ACS ${acs.toFixed(0)}${acs >= goals.acs ? ' ✓' : ` (meta ${goals.acs})`}`);
      if (goals.hsPct != null) items.push(`HS% ${hsPct.toFixed(0)}${hsPct >= goals.hsPct ? ' ✓' : ` (meta ${goals.hsPct}%)`}`);
      if (goals.adr != null) items.push(`ADR ${adr.toFixed(0)}${adr >= goals.adr ? ' ✓' : ` (meta ${goals.adr})`}`);
      out.push({
        id: 'goals',
        tone: 'info',
        title: `Metas · ${week.length} partidas`,
        detail: items.join(' · ') || 'Sin metas numéricas definidas.',
      });
    }

    // 4b) Impacto: FB/FD por partida (meta del plan: FB ≥ 2.5 · FD ≤ 2.0)
    const impact = matches.filter((m) => m.firstBloods != null && m.firstDeaths != null);
    if (impact.length >= MIN_GAMES) {
      const fb = impact.reduce((a, m) => a + (m.firstBloods ?? 0), 0) / impact.length;
      const fd = impact.reduce((a, m) => a + (m.firstDeaths ?? 0), 0) / impact.length;
      const fdHigh = impact.filter((m) => (m.firstDeaths ?? 0) >= 3).length;
      const ok = fb >= 2.5 && fd <= 2;
      const balance = fb - fd;
      out.push({
        id: 'impacto',
        tone: ok ? 'good' : fd >= 2.5 || fb < 2 ? 'bad' : 'warn',
        title: `Impacto: FB ${fb.toFixed(1)} · FD ${fd.toFixed(1)} por partida`,
        detail: ok
          ? `Balance ${balance >= 0 ? '+' : ''}${balance.toFixed(1)} · meta cumplida (FB ≥ 2.5, FD ≤ 2.0).`
          : `Meta: FB ≥ 2.5 y FD ≤ 2.0 · balance ${balance >= 0 ? '+' : ''}${balance.toFixed(1)}${fdHigh ? ` · ${fdHigh} partida(s) con 3+ primeras muertes (a la 3.ª, modo "no regalar")` : ''}.`,
      });
    }

    // 5) Mapas jugados sin regla
    if (rules) {
      const unruled = [...playedMaps].filter((map) => !poolRuleFor(rules, map)).slice(0, 3);
      if (unruled.length > 0) {
        out.push({
          id: 'unruled',
          tone: 'info',
          title: `Sin regla en ${unruled.join(', ')}`,
          detail: 'Jugaste esos mapas pero no tienen pool definido: sin regla la auditoría no puede marcarlos.',
        });
      }
    }

    return out.slice(0, MAX_SUGGESTIONS);
  }, [days, matches, rules, onApply, onConfigure]);

  return (
    <div className={embedded ? 'advice-embedded' : 'panel'}>
      {embedded ? (
        <b className="advice-scope">Recomendaciones · {scopeLabel}</b>
      ) : (
        <div className="pf-section-head">
          <h2 style={{ margin: 0 }}>Recomendaciones</h2>
          <span className="window-info">{profile.label} · {scopeLabel}</span>
        </div>
      )}
      {msg ? <p className="window-info" style={{ marginTop: 8 }}>{msg}</p> : null}
      {suggestions.length === 0 ? (
        <p className="empty" style={{ marginTop: 12 }}>Sin hallazgos: pool limpio, cortes respetados y metas al día.</p>
      ) : (
        <div className="advice-list">
          {suggestions.map((s) => (
            <div key={s.id} className={`advice ${s.tone}`}>
              <div className="advice-main">
                <b>{s.title}</b>
                <span>{s.detail}</span>
              </div>
              {s.action ? (
                <button
                  className="f-chip"
                  disabled={busy != null}
                  onClick={async () => {
                    setBusy(s.id);
                    setMsg(null);
                    try {
                      await s.action!.run();
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {busy === s.id ? 'Aplicando…' : s.action.label}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function wrOf(matches: MatchRow[], agent: string, map: string): { games: number; wr: number } {
  const list = matches.filter((m) => m.map === map && m.agent === agent);
  const decisive = list.filter((m) => m.roundsWon !== m.roundsLost);
  const wins = decisive.filter((m) => m.won).length;
  return { games: list.length, wr: decisive.length ? (wins / decisive.length) * 100 : 0 };
}
