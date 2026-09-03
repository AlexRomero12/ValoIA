'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TopBar } from '@/components/TopBar';
import { AuditDay } from '@/components/audit/AuditDay';
import { auditDay, groupAuditWeeks, mondayOf, type AuditDay as AuditDayT } from '@/lib/audit';
import { sameAuditDay, storedToAuditDay, toStoredAuditDay, type StoredAuditDay } from '@/lib/auditHistory';
import { useValSummary } from '@/lib/hooks';
import type { MatchComment } from '@/lib/matchComments';
import type { MatchRow } from '@/lib/types';

const FETCH_DAYS = 30;
const LIMIT = 40;

function isoDayLocal(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtRR(v: number | null): string {
  return v == null ? '—' : `${v > 0 ? '+' : ''}${v}`;
}

/**
 * Unión de un día calculado en vivo con su snapshot guardado:
 * si el live quedó parcial (la API ya no da el RR de partidas viejas) pero la
 * copia histórica estaba completa, usamos la copia.
 */
function enrichWithHistory(d: AuditDayT, saved?: StoredAuditDay): AuditDayT {
  if (!saved || d.rrCoverage) return d;
  if (!saved.rrCoverage) return d;
  return {
    ...d,
    realRR: saved.realRR,
    planRR: saved.planRR,
    planPoolRR: saved.planPoolRR,
    rrCoverage: true,
    rrMissing: 0,
    violationCost: saved.violationCost,
    stored: true,
  };
}

export default function AuditoriaPage() {
  const [comments, setComments] = useState<Record<string, MatchComment>>({});
  const [history, setHistory] = useState<Record<string, StoredAuditDay>>({});
  const saving = useRef(false);
  // Lunes de la semana actual, fijado una sola vez al montar la página.
  const [mondayTs] = useState(() => mondayOf(Date.now()).getTime());

  const query = useValSummary({ kind: 'days', days: FETCH_DAYS }, 'alex', LIMIT);
  const data = query.data;

  const commentsQ = useQuery<{ comments: Record<string, MatchComment> }>({
    queryKey: ['match-comments'],
    queryFn: async () => {
      const res = await fetch('/api/valorant/comments');
      return res.json();
    },
    staleTime: 60_000,
  });
  useEffectComments(commentsQ.data?.comments, setComments);

  const historyQ = useQuery<{ days: Record<string, StoredAuditDay> }>({
    queryKey: ['audit-history'],
    queryFn: async () => {
      const res = await fetch('/api/valorant/audit-history');
      return res.json();
    },
    staleTime: Infinity,
  });
  useEffectComments(historyQ.data?.days, setHistory);

  const { allDays, currentDays, pastWeeks, weekTotals, weekPartial, weekRange } = useMemo(() => {
    const matches: MatchRow[] = [...(data?.matches ?? [])].sort((a, b) => a.timestamp - b.timestamp);
    const days = new Map<string, MatchRow[]>();
    for (const m of matches) {
      const k = isoDayLocal(m.timestamp);
      const list = days.get(k) ?? [];
      list.push(m);
      days.set(k, list);
    }
    // Días con partidas en vivo, enriquecidos con el snapshot guardado si el live es parcial.
    const byKey = new Map<string, AuditDayT>();
    for (const [k, list] of days.entries()) {
      const live = auditDay(list);
      byKey.set(k, enrichWithHistory(live, history[k]));
    }
    // Días que la API ya no devuelve pero tenemos guardados (semanas pasadas).
    for (const [k, s] of Object.entries(history)) {
      if (s.dayStart >= mondayTs) continue; // la semana actual siempre se calcula en vivo
      if (!byKey.has(k)) byKey.set(k, storedToAuditDay(s));
    }
    const audited = [...byKey.values()].sort((a, b) => b.dayStart - a.dayStart);

    const current: AuditDayT[] = [];
    const past: AuditDayT[] = [];
    for (const d of audited) {
      if (d.dayStart >= mondayTs) current.push(d);
      else past.push(d);
    }

    const sum = (pick: (d: AuditDayT) => number | null): number | null => {
      const vals = current.map(pick).filter((v): v is number => v != null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
    };

    return {
      allDays: audited,
      currentDays: current,
      pastWeeks: groupAuditWeeks(past).reverse(),
      weekTotals: {
        matches: current.reduce((a, d) => a + d.matches.length, 0),
        realRR: sum((d) => d.realRR),
        planRR: sum((d) => d.planRR),
        planPoolRR: sum((d) => d.planPoolRR),
        violationCost: sum((d) => d.violationCost),
        violationCount: current.reduce((a, d) => a + d.violationCount, 0),
        cutsIgnored: current.filter((d) => d.cutIgnored).length,
        cutsTotal: current.filter((d) => d.cutAt != null).length,
      },
      weekPartial: current.some((d) => !d.rrCoverage),
      weekRange: `${new Date(mondayTs).toLocaleDateString('es', { day: 'numeric', month: 'short' })} — ${new Date().toLocaleDateString('es', { day: 'numeric', month: 'short' })}`,
    };
  }, [data, mondayTs, history]);

  // Persistir los días COMPLETOS que aún no están guardados (o que cambiaron):
  // cuando la API deje de devolver su RR, seguiremos teniendo el snapshot.
  useEffect(() => {
    if (saving.current) return;
    const pending = allDays
      .filter((d) => d.rrCoverage)
      .map(toStoredAuditDay)
      .filter((s) => !history[s.key] || !sameAuditDay(history[s.key], s));
    if (!pending.length) return;
    saving.current = true;
    fetch('/api/valorant/audit-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days: pending }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (j.days) setHistory(j.days as Record<string, StoredAuditDay>);
      })
      .catch(() => undefined)
      .finally(() => {
        saving.current = false;
      });
  }, [allDays, history]);

  const saveComment = async (matchId: string, text: string) => {
    const res = await fetch('/api/valorant/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchId, text }),
    });
    const json = await res.json();
    if (!res.ok || !json.comments) throw new Error(json.error || 'No se pudo guardar la nota');
    setComments(json.comments as Record<string, MatchComment>);
  };

  const refresh = async () => {
    await Promise.all([query.refetch(), commentsQ.refetch(), historyQ.refetch()]);
  };

  const error = query.error as (Error & { code?: string }) | null;
  const wt = weekTotals;

  return (
    <div className="wrap">
      <TopBar
        accent="red"
        title="Auditoría"
        subtitle={['Reglas de', 'sesión']}
        chip={
          <span className="chip-red">
            {query.isLoading ? 'cargando…' : `${wt.matches} competitivas · ${fmtRR(wt.realRR)} RR (semana)`}
          </span>
        }
        updated={data ? `actualizado ${new Date(data.generatedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}` : null}
        onRefresh={refresh}
        loading={query.isFetching}
        activePage="auditoria"
      />

      {error && <div className="banner error">{error.message}</div>}

      {query.isLoading && <p className="empty" style={{ marginTop: 24 }}>Cargando auditoría…</p>}

      {data && (
        <>
          <div className="audit-hero">
            <div className="audit-hero-main">
              <span className="audit-hero-eyebrow">Semana {weekRange}</span>
              <div className="audit-hero-line">
                <span className={`audit-hero-num ${(wt.realRR ?? 0) < 0 ? 'loss' : 'win'}`}>{fmtRR(wt.realRR)}</span>
                <span className="audit-hero-unit">RR</span>
              </div>
            </div>
            <div className="audit-hero-deltas">
              <div className="audit-hero-delta">
                <span className="audit-hero-delta-lbl">Con regla</span>
                <span className="audit-hero-delta-val">{fmtRR(wt.planRR)}</span>
              </div>
              <div className="audit-hero-delta">
                <span className="audit-hero-delta-lbl">Regla + pool</span>
                <span className="audit-hero-delta-val">{fmtRR(wt.planPoolRR)}</span>
              </div>
            </div>
            <div className="audit-hero-faltas">
              <span className="audit-falta">
                {wt.matches} competitivas
              </span>
              <span className={`audit-falta${wt.cutsIgnored ? ' bad' : ''}`}>
                {wt.cutsTotal ? `${wt.cutsIgnored}/${wt.cutsTotal} cortes ignorados` : 'sin cortes'}
              </span>
              <span className={`audit-falta${wt.violationCount ? ' bad' : ''}`}>
                {wt.violationCount ? `${wt.violationCount} fuera de pool · ${fmtRR(wt.violationCost)} RR` : 'pool limpio'}
              </span>
              {weekPartial ? <span className="audit-falta warn">RR parcial</span> : null}
            </div>
          </div>

          {currentDays.length === 0 ? (
            <p className="empty" style={{ marginTop: 20 }}>
              Sin competitivas desde el lunes. Juega ranked y aquí aparece la auditoría del día.
            </p>
          ) : (
            currentDays.map((d, i) => (
              <AuditDay
                key={d.key}
                day={d}
                comments={comments}
                onSaveComment={saveComment}
                defaultOpen={i === 0}
              />
            ))
          )}

          {pastWeeks.length > 0 && (
            <div className="panel" style={{ marginTop: 20 }}>
              <h2>Semanas anteriores · resumen</h2>
              <p className="audit-cover-note">
                Basado en las últimas {LIMIT} competitivas de la API + snapshots guardados de días completos
                (la API solo conserva el RR de las ~20 partidas más recientes).
              </p>
              <div className="table-scroll">
                <table className="score-table audit-table">
                  <thead>
                    <tr>
                      <th>Semana</th><th className="num">Partidas</th><th className="num">RR real</th>
                      <th className="num">Con regla</th><th className="num">Regla + pool</th>
                      <th className="num">Fuera de pool</th><th className="num">Cortes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pastWeeks.map((w) => (
                      <tr key={w.key}>
                        <td>
                          {w.label}
                          {w.rrPartial ? (
                            <span className="audit-warn" title="Algún día sin RR completo ni snapshot"> · parcial</span>
                          ) : w.days.every((d) => d.stored) ? (
                            <span className="audit-warn" title="RR recuperado del snapshot guardado"> · guardado</span>
                          ) : null}
                        </td>
                        <td className="num">{w.matches}</td>
                        <td className={`num ${(w.realRR ?? 0) < 0 ? 'stat-loss' : 'stat-win'}`}>{fmtRR(w.realRR)}</td>
                        <td className="num">{fmtRR(w.planRR)}</td>
                        <td className="num">{fmtRR(w.planPoolRR)}</td>
                        <td className="num">{w.violationCount ? `${w.violationCount} · ${fmtRR(w.violationCost)}` : '—'}</td>
                        <td className="num">
                          {w.cutsTotal ? `${w.cutsIgnored}/${w.cutsTotal} ignorados` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Sincroniza un objeto cargado hacia el estado local (solo si cambia). */
function useEffectComments<T extends Record<string, unknown>>(incoming: T | undefined, set: (v: T) => void) {
  const last = useRef<T | null>(null);
  useEffect(() => {
    if (incoming && incoming !== last.current) {
      last.current = incoming;
      set(incoming);
    }
  }, [incoming, set]);
}