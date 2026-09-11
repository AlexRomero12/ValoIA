'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { TopBar } from '@/components/TopBar';
import { AuditDay } from '@/components/audit/AuditDay';
import { AuditIntro } from '@/components/audit/AuditIntro';
import { AuditProposal } from '@/components/audit/AuditProposal';
import { AuditRecommendations } from '@/components/audit/AuditRecommendations';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { auditDay, groupAuditWeeks, mondayOf, type AuditDay as AuditDayT, type AuditWeek } from '@/lib/audit';
import { sameAuditDay, storedDayKey, storedToAuditDay, toStoredAuditDay, type StoredAuditDay } from '@/lib/auditHistory';
import { useProfileActions, useProfiles, useValSummary } from '@/lib/hooks';
import { emptyAuditRules, primaryOf, type AuditRules, type Profile } from '@/lib/profileTypes';
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

/** Impacto ponderado (FB/FD por partida) de un conjunto de días con detalle de kill feed. */
function impactOfDays(days: AuditDayT[]): { fb: number; fd: number; matches: number } | null {
  const withData = days.filter((d) => d.fbTotal != null && d.fdTotal != null && d.matches.length > 0);
  const n = withData.reduce((a, d) => a + d.matches.length, 0);
  if (!n) return null;
  const fb = withData.reduce((a, d) => a + (d.fbTotal ?? 0), 0) / n;
  const fd = withData.reduce((a, d) => a + (d.fdTotal ?? 0), 0) / n;
  return { fb, fd, matches: n };
}

/** Celda FB/FD de la tabla de semanas anteriores. */
function renderWeekImpact(w: AuditWeek): ReactNode {
  const imp = impactOfDays(w.days);
  if (!imp) return <span title="Sin detalle de kill feed en esta semana (días solo con snapshot)">—</span>;
  const ok = imp.fb >= 2.5 && imp.fd <= 2;
  return (
    <span
      className={ok ? 'stat-win' : 'stat-loss'}
      title={`FB ${imp.fb.toFixed(1)} · FD ${imp.fd.toFixed(1)} por partida en ${imp.matches}p con detalle · meta FB ≥ 2.5 y FD ≤ 2.0`}
    >
      {imp.fb.toFixed(1)}/{imp.fd.toFixed(1)}
    </span>
  );
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
    violationLoss: saved.violationLoss ?? (saved.violationCost != null && saved.violationCost < 0 ? saved.violationCost : null),
    violationGain: saved.violationGain ?? (saved.violationCost != null && saved.violationCost > 0 ? saved.violationCost : null),
    stored: true,
    storedMatches: saved.matches,
  };
}

export default function AuditoriaPage() {
  const [comments, setComments] = useState<Record<string, MatchComment>>({});
  const [history, setHistory] = useState<Record<string, StoredAuditDay>>({});
  const [applyError, setApplyError] = useState<string | null>(null);
  const [openWeek, setOpenWeek] = useState<string | null>(null);
  const saving = useRef(false);
  // Lunes de la semana actual, fijado una sola vez al montar la página.
  const [mondayTs] = useState(() => mondayOf(Date.now()).getTime());

  const profilesQ = useProfiles();
  const actions = useProfileActions();

  // Auditoría: SOLO el perfil principal (se elige en /perfiles; fallback al primer visible).
  const profile: Profile | undefined = primaryOf(profilesQ.data ?? []);
  const rules: AuditRules | undefined = profile?.audit;
  const pid = profile?.id ?? '';

  const query = useValSummary({ kind: 'days', days: FETCH_DAYS }, pid, LIMIT, Boolean(profile));
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

  const { allDays, currentDays, pastWeeks, weekTotals, weekImpact, weekPartial, weekRange } = useMemo(() => {
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
      const live = auditDay(list, rules);
      byKey.set(storedDayKey(pid, k), enrichWithHistory(live, history[storedDayKey(pid, k)]));
    }
    // Días que la API ya no devuelve pero tenemos guardados (semanas pasadas) del perfil.
    const prefix = `${pid}:`;
    if (pid) {
      for (const [k, s] of Object.entries(history)) {
        if (!k.startsWith(prefix)) continue;
        if (s.dayStart >= mondayTs) continue; // la semana actual siempre se calcula en vivo
        if (!byKey.has(k)) byKey.set(k, storedToAuditDay(s));
      }
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
      weekImpact: impactOfDays(current),
      weekTotals: {
        matches: current.reduce((a, d) => a + d.matches.length, 0),
        realRR: sum((d) => d.realRR),
        planRR: sum((d) => d.planRR),
        planPoolRR: sum((d) => d.planPoolRR),
        violationCost: sum((d) => d.violationCost),
        violationLoss: sum((d) => d.violationLoss),
        violationGain: sum((d) => d.violationGain),
        violationCount: current.reduce((a, d) => a + d.violationCount, 0),
        bannedCount: current.reduce((a, d) => a + d.bannedCount, 0),
        cutsIgnored: current.filter((d) => d.cutIgnored).length,
        cutsTotal: current.filter((d) => d.cutAt != null).length,
      },
      weekPartial: current.some((d) => !d.rrCoverage),
      weekRange: `${new Date(mondayTs).toLocaleDateString('es', { day: 'numeric', month: 'short' })} — ${new Date().toLocaleDateString('es', { day: 'numeric', month: 'short' })}`,
    };
  }, [data, mondayTs, history, rules, pid]);

  // Partidas de la semana en curso (recomendaciones de arriba); para semanas
  // pasadas se filtra por el rango del "Ver más".
  const currentWeekMatches = useMemo(
    () => (data?.matches ?? []).filter((m) => m.timestamp >= mondayTs),
    [data, mondayTs],
  );
  const weekMatchesOf = (w: AuditWeek) => {
    const start = w.days[0]?.dayStart ?? 0;
    const end = start + 7 * 86_400_000;
    return (data?.matches ?? []).filter((m) => m.timestamp >= start && m.timestamp < end);
  };

  // Persistir los días COMPLETOS que aún no están guardados (o que cambiaron):
  // cuando la API deje de devolver su RR, seguiremos teniendo el snapshot.
  useEffect(() => {
    if (saving.current || !pid) return;
    const pending = allDays
      .filter((d) => d.rrCoverage)
      .map((d) => toStoredAuditDay(d, pid, rules?.rulesVersion))
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
  }, [allDays, history, pid, rules?.rulesVersion]);

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

  const applyRules = async (next: AuditRules) => {
    if (!profile) return;
    setApplyError(null);
    const res = await actions.upsert({ id: profile.id, name: profile.name, tag: profile.tag, audit: next });
    if (!res.ok) setApplyError(res.error ?? 'No se pudo aplicar la recomendación');
  };

  const configureRules = async () => {
    if (!profile) return;
    await applyRules(emptyAuditRules());
  };

  const error = query.error as (Error & { code?: string }) | null;
  const wt = weekTotals;
  const loadingProfiles = profilesQ.isLoading;
  const coldLoad = Boolean(profile) && query.isLoading && !data;

  const rulesSummary = rules
    ? `Reglas de ${profile?.label}: ${Object.keys(rules.pool.byMap).length} mapas con pool${rules.pool.default && (rules.pool.default.main.length || rules.pool.default.backup.length) ? ' + default' : ''}${
        rules.bannedRoles.length ? ` · ${rules.bannedRoles.join('/')} prohibido` : ''
      } · corte ${rules.stop.losses}×K/D<${rules.stop.kdBelow} · sesión ≥ ${Math.round(rules.sessions.gapMinutes / 60)}h · v${rules.rulesVersion}`
    : profile
      ? `${profile.label} sin pool configurado — cortes con defaults (2×K/D<0.9 · sesión ≥ 3h)`
      : '';

  return (
    <div className="wrap">
      <TopBar
        accent="red"
        title="Reglas de sesión"
        subtitle={['Cortes, pausas', 'y pool']}
        chip={
          <span className="chip-red">
            {loadingProfiles || coldLoad ? 'cargando…' : `${wt.matches} competitivas · ${fmtRR(wt.realRR)} RR (semana)`}
          </span>
        }
        updated={data ? `actualizado ${new Date(data.generatedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}` : null}
        onRefresh={refresh}
        loading={query.isFetching}
        disabled={!profile}
        activePage="auditoria"
      />

      <LoadingOverlay open={loadingProfiles} title="Cargando perfiles" message="Leyendo los perfiles configurados" blocking />
      <LoadingOverlay
        open={coldLoad}
        title={`Cargando auditoría de ${profile?.label ?? ''}`}
        message="Partidas y RR de los últimos 30 días (puede tardar en la primera carga)"
        blocking
      />

      {!profile && !loadingProfiles ? (
        <div className="panel" style={{ marginTop: 20 }}>
          <p className="empty">
            No hay ningún perfil. <Link href="/perfiles">Crea tus perfiles</Link> para auditar.
          </p>
        </div>
      ) : null}

      {profile ? (
        <div className="controls" style={{ marginTop: 20 }}>
          <label>Perfil principal</label>
          <span className="f-chip player-on" title={`${profile.name}#${profile.tag}`}>{profile.label}</span>
          <Link className="f-chip profile-chip add" href="/perfiles" title="Cambiar el perfil principal">Cambiar en Perfiles</Link>
          <span className="window-info">{rulesSummary}</span>
        </div>
      ) : null}

      {applyError ? <div className="banner error">{applyError}</div> : null}
      {error && <div className="banner error">{error.message}</div>}

      {query.isLoading && !loadingProfiles && <p className="empty" style={{ marginTop: 24 }}>Cargando auditoría…</p>}

      {data && profile && (
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
                {wt.violationCount ? `${wt.violationCount} fuera de pool · ${fmtRR(wt.violationLoss)} RR` : 'pool limpio'}
              </span>
              {wt.bannedCount ? <span className="audit-falta bad">{wt.bannedCount} prohibidos</span> : null}
              {weekImpact ? (
                <span
                  className={`audit-falta${weekImpact.fb >= 2.5 && weekImpact.fd <= 2 ? '' : ' bad'}`}
                  title={`Impacto de la semana: FB ${weekImpact.fb.toFixed(1)} y FD ${weekImpact.fd.toFixed(1)} por partida en ${weekImpact.matches}p con detalle · meta FB ≥ 2.5 y FD ≤ 2.0`}
                >
                  Impacto FB {weekImpact.fb.toFixed(1)} · FD {weekImpact.fd.toFixed(1)}
                </span>
              ) : null}
              {weekPartial ? <span className="audit-falta warn">RR parcial</span> : null}
            </div>
          </div>

          <AuditIntro hasRules={Boolean(rules)} />
          <AuditProposal matches={data.matches ?? []} hasRules={Boolean(rules)} onApply={applyRules} />

          <AuditRecommendations
            profile={profile}
            rules={rules}
            matches={currentWeekMatches}
            days={currentDays}
            scopeLabel="semana actual"
            onApply={applyRules}
            onConfigure={configureRules}
          />

          {currentDays.length === 0 ? (
            <p className="empty" style={{ marginTop: 20 }}>
              Sin competitivas desde el lunes. Juega ranked y aquí aparece la auditoría del día.
            </p>
          ) : (
            currentDays.map((d, i) => (
              <AuditDay
                key={d.key}
                day={d}
                rules={rules}
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
                      <th>Semana</th><th className="num">Partidas</th><th className="num">FB/FD</th><th className="num">RR real</th>
                      <th className="num">Con regla</th><th className="num">Regla + pool</th>
                      <th className="num">Fuera de pool</th><th className="num">Cortes</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {pastWeeks.map((w) => (
                      <Fragment key={w.key}>
                        <tr>
                          <td>
                            {w.label}
                            {w.rrPartial ? (
                              <span className="audit-warn" title="Algún día sin RR completo ni snapshot"> · parcial</span>
                            ) : w.days.every((d) => d.stored) ? (
                              <span className="audit-warn" title="RR recuperado del snapshot guardado"> · guardado</span>
                            ) : null}
                          </td>
                          <td className="num">{w.matches}</td>
                          <td className="num">{renderWeekImpact(w)}</td>
                          <td className={`num ${(w.realRR ?? 0) < 0 ? 'stat-loss' : 'stat-win'}`}>{fmtRR(w.realRR)}</td>
                          <td className="num">{fmtRR(w.planRR)}</td>
                          <td className="num">{fmtRR(w.planPoolRR)}</td>
                          <td className="num">
                            {w.violationCount ? `${w.violationCount}${w.bannedCount ? ` (${w.bannedCount} proh.)` : ''} · ${fmtRR(w.violationLoss)}` : '—'}
                          </td>
                          <td className="num">
                            {w.cutsTotal ? `${w.cutsIgnored}/${w.cutsTotal} ignorados` : '—'}
                          </td>
                          <td className="num">
                            <button
                              className="f-chip"
                              onClick={() => setOpenWeek(openWeek === w.key ? null : w.key)}
                              aria-expanded={openWeek === w.key}
                            >
                              {openWeek === w.key ? 'Ver menos' : 'Ver más'}
                            </button>
                          </td>
                        </tr>
                        {openWeek === w.key ? (
                          <tr className="week-detail-row">
                            <td colSpan={9}>
                              <AuditRecommendations
                                embedded
                                profile={profile}
                                rules={rules}
                                matches={weekMatchesOf(w)}
                                days={w.days}
                                scopeLabel={`semana del ${w.label}`}
                                onApply={applyRules}
                                onConfigure={configureRules}
                              />
                              {w.days.filter((d) => d.matches.length > 0).map((d) => (
                                <AuditDay
                                  key={d.key}
                                  day={d}
                                  rules={rules}
                                  comments={comments}
                                  onSaveComment={saveComment}
                                />
                              ))}
                              {w.days.some((d) => d.matches.length === 0) ? (
                                <p className="audit-cover-note">
                                  {w.days.filter((d) => d.matches.length === 0).length} día(s) solo con snapshot (sin detalle de partidas).
                                </p>
                              ) : null}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
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
