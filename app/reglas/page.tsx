'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { TopBar } from '@/components/TopBar';
import { RulesDay } from '@/components/rules/RulesDay';
import { RulesIntro } from '@/components/rules/RulesIntro';
import { RulesProposal } from '@/components/rules/RulesProposal';
import { RulesRecommendations } from '@/components/rules/RulesRecommendations';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useElementWidth } from '@/lib/useElementWidth';
import { evaluateDay, groupEvaluationWeeks, mondayOf, type DayEvaluation, type RulesWeek } from '@/lib/rules';
import { sameRulesDay, storedDayKey, storedToRulesDay, toStoredRulesDay, type StoredRulesDay } from '@/lib/rulesHistory';
import { useProfileActions, useProfiles, useValSummary } from '@/lib/hooks';
import { emptySessionRules, primaryOf, type SessionRules, type Profile } from '@/lib/profileTypes';
import type { MatchComment } from '@/lib/matchComments';
import type { MatchRow } from '@/lib/types';

const FETCH_DAYS = 30;
const LIMIT = 40;

function isoDayLocal(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function recordText(wins: number, losses: number, draws = 0): string {
  return `${wins}V-${losses}D${draws ? `-${draws}E` : ''}`;
}

/** Impacto ponderado (FB/FD por partida) de un conjunto de días con detalle de kill feed. */
function impactOfDays(days: DayEvaluation[]): { fb: number; fd: number; matches: number } | null {
  const withData = days.filter((d) => d.fbTotal != null && d.fdTotal != null && d.matches.length > 0);
  const n = withData.reduce((a, d) => a + d.matches.length, 0);
  if (!n) return null;
  const fb = withData.reduce((a, d) => a + (d.fbTotal ?? 0), 0) / n;
  const fd = withData.reduce((a, d) => a + (d.fdTotal ?? 0), 0) / n;
  return { fb, fd, matches: n };
}

/** Celda FB/FD de la tabla de semanas anteriores. */
function renderWeekImpact(w: RulesWeek): ReactNode {
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
 * Unión de un día calculado en vivo con su snapshot guardado.
 * Sin RR, la evaluación en vivo de un día con partidas ya es completa: solo se
 * usa el snapshot si el día llegó sin detalle (no debería ocurrir aquí).
 */
function enrichWithHistory(d: DayEvaluation, saved?: StoredRulesDay): DayEvaluation {
  if (d.matches.length > 0 || !saved) return d;
  return storedToRulesDay(saved);
}

export default function ReglasPage() {
  const [comments, setComments] = useState<Record<string, MatchComment>>({});
  const [history, setHistory] = useState<Record<string, StoredRulesDay>>({});
  const [applyError, setApplyError] = useState<string | null>(null);
  const [openWeek, setOpenWeek] = useState<string | null>(null);
  // Acordeón móvil: undefined = auto (día más reciente), null = todos cerrados.
  const [openDayKey, setOpenDayKey] = useState<string | null | undefined>(undefined);
  const { ref: daysRef, width: daysW } = useElementWidth(1200);
  const saving = useRef(false);
  // Lunes de la semana actual, fijado una sola vez al montar la página.
  const [mondayTs] = useState(() => mondayOf(Date.now()).getTime());

  const profilesQ = useProfiles();
  const actions = useProfileActions();

  // Reglas: SOLO el perfil principal (se elige en /perfiles; fallback al primer visible).
  const profile: Profile | undefined = primaryOf(profilesQ.data ?? []);
  const rules: SessionRules | undefined = profile?.rules;
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

  const historyQ = useQuery<{ days: Record<string, StoredRulesDay> }>({
    queryKey: ['rules-history'],
    queryFn: async () => {
      const res = await fetch('/api/valorant/rules-history');
      return res.json();
    },
    staleTime: Infinity,
  });
  useEffectComments(historyQ.data?.days, setHistory);

  const { allDays, currentDays, pastWeeks, weekTotals, weekImpact, weekRange } = useMemo(() => {
    const matches: MatchRow[] = [...(data?.matches ?? [])].sort((a, b) => a.timestamp - b.timestamp);
    const days = new Map<string, MatchRow[]>();
    for (const m of matches) {
      const k = isoDayLocal(m.timestamp);
      const list = days.get(k) ?? [];
      list.push(m);
      days.set(k, list);
    }
    // Días con partidas en vivo, enriquecidos con el snapshot guardado si el live es parcial.
    const byKey = new Map<string, DayEvaluation>();
    for (const [k, list] of days.entries()) {
      const live = evaluateDay(list, rules);
      byKey.set(storedDayKey(pid, k), enrichWithHistory(live, history[storedDayKey(pid, k)]));
    }
    // Días que la API ya no devuelve pero tenemos guardados (semanas pasadas) del perfil.
    const prefix = `${pid}:`;
    if (pid) {
      for (const [k, s] of Object.entries(history)) {
        if (!k.startsWith(prefix)) continue;
        if (s.dayStart >= mondayTs) continue; // la semana actual siempre se calcula en vivo
        if (!byKey.has(k)) byKey.set(k, storedToRulesDay(s));
      }
    }
    const evaluated = [...byKey.values()].sort((a, b) => b.dayStart - a.dayStart);

    const current: DayEvaluation[] = [];
    const past: DayEvaluation[] = [];
    for (const d of evaluated) {
      if (d.dayStart >= mondayTs) current.push(d);
      else past.push(d);
    }

    const sum = (pick: (d: DayEvaluation) => number): number => current.reduce((a, d) => a + pick(d), 0);

    return {
      allDays: evaluated,
      currentDays: current,
      pastWeeks: groupEvaluationWeeks(past).reverse(),
      weekImpact: impactOfDays(current),
      weekTotals: {
        matches: current.reduce((a, d) => a + d.matches.length, 0),
        wins: sum((d) => d.wins),
        losses: sum((d) => d.losses),
        draws: sum((d) => d.draws),
        planWins: sum((d) => d.planWins),
        planLosses: sum((d) => d.planLosses),
        poolWins: sum((d) => d.poolWins),
        poolLosses: sum((d) => d.poolLosses),
        violationLosses: sum((d) => d.violationLosses),
        violationCount: current.reduce((a, d) => a + d.violationCount, 0),
        bannedCount: current.reduce((a, d) => a + d.bannedCount, 0),
        cutsIgnored: current.filter((d) => d.cutIgnored).length,
        cutsTotal: current.filter((d) => d.cutAt != null).length,
      },
      weekRange: `${new Date(mondayTs).toLocaleDateString('es', { day: 'numeric', month: 'short' })} — ${new Date().toLocaleDateString('es', { day: 'numeric', month: 'short' })}`,
    };
  }, [data, mondayTs, history, rules, pid]);

  // Partidas de la semana en curso (recomendaciones de arriba); para semanas
  // pasadas se filtra por el rango del "Ver más".
  const currentWeekMatches = useMemo(
    () => (data?.matches ?? []).filter((m) => m.timestamp >= mondayTs),
    [data, mondayTs],
  );
  const weekMatchesOf = (w: RulesWeek) => {
    const start = w.days[0]?.dayStart ?? 0;
    const end = start + 7 * 86_400_000;
    return (data?.matches ?? []).filter((m) => m.timestamp >= start && m.timestamp < end);
  };

  // Móvil: acordeón (un día abierto) y tarjetas en lugar de tablas anchas.
  const mobileRules = daysW < 720;
  const activeOpenDay = openDayKey === undefined ? (currentDays[0]?.key ?? null) : openDayKey;

  /** Detalle de una semana pasada: se reutiliza en la tabla y en las tarjetas. */
  const weekDetail = (w: RulesWeek) => (
    <>
      <RulesRecommendations
        embedded
        profile={profile!}
        rules={rules}
        matches={weekMatchesOf(w)}
        days={w.days}
        scopeLabel={`semana del ${w.label}`}
        onApply={applyRules}
        onConfigure={configureRules}
      />
      {w.days.filter((d) => d.matches.length > 0).map((d) => (
        <RulesDay
          key={d.key}
          day={d}
          rules={rules}
          comments={comments}
          onSaveComment={saveComment}
        />
      ))}
      {w.days.some((d) => d.matches.length === 0) ? (
        <p className="rules-cover-note">
          {w.days.filter((d) => d.matches.length === 0).length} día(s) solo con snapshot (sin detalle de partidas).
        </p>
      ) : null}
    </>
  );

  // Persistir los días COMPLETOS que aún no están guardados (o que cambiaron):
  // cuando la API deje de devolver su RR, seguiremos teniendo el snapshot.
  // Solo días evaluados en vivo (`matches`): los snapshots históricos no se
  // reescriben al cambiar reglas (el pasado queda como se evaluó).
  useEffect(() => {
    if (saving.current || !pid) return;
    const pending = allDays
      .filter((d) => d.matches.length > 0)
      .map((d) => toStoredRulesDay(d, pid, rules?.rulesVersion))
      .filter((s) => !history[s.key] || !sameRulesDay(history[s.key], s));
    if (!pending.length) return;
    saving.current = true;
    fetch('/api/valorant/rules-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days: pending }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (j.days) setHistory(j.days as Record<string, StoredRulesDay>);
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

  const applyRules = async (next: SessionRules): Promise<boolean> => {
    if (!profile) return false;
    setApplyError(null);
    const res = await actions.upsert({ id: profile.id, name: profile.name, tag: profile.tag, rules: next });
    if (!res.ok) {
      setApplyError(res.error ?? 'No se pudo aplicar la recomendación');
      return false;
    }
    return true;
  };

  const configureRules = async (): Promise<boolean> => {
    if (!profile) return false;
    return applyRules(emptySessionRules());
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
            {loadingProfiles || coldLoad ? 'cargando…' : `${wt.matches} competitivas · ${recordText(wt.wins, wt.losses)} (semana)`}
          </span>
        }
        updated={data ? `actualizado ${new Date(data.generatedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}` : null}
        onRefresh={refresh}
        loading={query.isFetching}
        disabled={!profile}
        activePage="reglas"
      />

      <LoadingOverlay open={loadingProfiles} title="Cargando perfiles" message="Leyendo los perfiles configurados" blocking />
      <LoadingOverlay
        open={coldLoad}
        title={`Analizando a ${profile?.label ?? ''}`}
        message="Partidas de los últimos 30 días (puede tardar en la primera carga)"
        blocking
      />

      {!profile && !loadingProfiles ? (
        <div className="panel" style={{ marginTop: 20 }}>
          <p className="empty">
            No hay ningún perfil. <Link href="/perfiles">Crea tus perfiles</Link> para aplicar tus reglas.
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

      {query.isLoading && !loadingProfiles && <p className="empty" style={{ marginTop: 24 }}>Cargando reglas…</p>}

      {data && profile && (
        <>
          <div className="rules-hero">
            <div className="rules-hero-main">
              <span className="rules-hero-eyebrow">Semana {weekRange}</span>
              <div className="rules-hero-line">
                <span className={`rules-hero-num ${wt.losses > wt.wins ? 'loss' : 'win'}`}>{recordText(wt.wins, wt.losses, wt.draws)}</span>
                <span className="rules-hero-unit">semana</span>
              </div>
            </div>
            <div className="rules-hero-deltas">
              <div className="rules-hero-delta">
                <span className="rules-hero-delta-lbl">Con regla</span>
                <span className="rules-hero-delta-val">{recordText(wt.planWins, wt.planLosses)}</span>
              </div>
              <div className="rules-hero-delta">
                <span className="rules-hero-delta-lbl">Regla + pool</span>
                <span className="rules-hero-delta-val">{recordText(wt.poolWins, wt.poolLosses)}</span>
              </div>
            </div>
            <div className="rules-hero-faltas">
              <span className="rules-falta">
                {wt.matches} competitivas
              </span>
              <span className={`rules-falta${wt.cutsIgnored ? ' bad' : ''}`}>
                {wt.cutsTotal ? `${wt.cutsIgnored}/${wt.cutsTotal} cortes ignorados` : 'sin cortes'}
              </span>
              <span className={`rules-falta${wt.violationCount ? ' bad' : ''}`}>
                {wt.violationCount ? `${wt.violationCount} fuera de pool · ${wt.violationLosses} D` : 'pool limpio'}
              </span>
              {wt.bannedCount ? <span className="rules-falta bad">{wt.bannedCount} prohibidos</span> : null}
              {weekImpact ? (
                <span
                  className={`rules-falta${weekImpact.fb >= 2.5 && weekImpact.fd <= 2 ? '' : ' bad'}`}
                  title={`Impacto de la semana: FB ${weekImpact.fb.toFixed(1)} y FD ${weekImpact.fd.toFixed(1)} por partida en ${weekImpact.matches}p con detalle · meta FB ≥ 2.5 y FD ≤ 2.0`}
                >
                  Impacto FB {weekImpact.fb.toFixed(1)} · FD {weekImpact.fd.toFixed(1)}
                </span>
              ) : null}
            </div>
          </div>

          <RulesIntro hasRules={Boolean(rules)} />
          <RulesProposal matches={data.matches ?? []} hasRules={Boolean(rules)} currentRules={rules} onApply={applyRules} />

          <RulesRecommendations
            profile={profile}
            rules={rules}
            matches={currentWeekMatches}
            days={currentDays}
            scopeLabel="semana actual"
            onApply={applyRules}
            onConfigure={configureRules}
          />

          <div ref={daysRef}>
            {currentDays.length === 0 ? (
              <p className="empty" style={{ marginTop: 20 }}>
                Sin competitivas desde el lunes. Juega ranked y aquí aparece la evaluación del día.
              </p>
            ) : (
              currentDays.map((d, i) => (
                <RulesDay
                  key={d.key}
                  day={d}
                  rules={rules}
                  comments={comments}
                  onSaveComment={saveComment}
                  {...(mobileRules
                    ? { open: activeOpenDay === d.key, onToggle: (o: boolean) => setOpenDayKey(o ? d.key : null) }
                    : { defaultOpen: i === 0 })}
                />
              ))
            )}
          </div>

          {pastWeeks.length > 0 && (
            <div className="panel" style={{ marginTop: 20 }}>
              <h2>Semanas anteriores · resumen</h2>
              <p className="rules-cover-note">
                Basado en las últimas {LIMIT} competitivas de la API + snapshots guardados de días completos.
              </p>
              <div className="table-scroll desktop-only">
                <table className="score-table rules-table">
                  <thead>
                    <tr>
                      <th>Semana</th><th className="num">Partidas</th><th className="num">FB/FD</th><th className="num">Récord real</th>
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
                            {w.days.every((d) => d.stored) ? (
                              <span className="rules-warn" title="Evaluación recuperada del snapshot guardado"> · guardado</span>
                            ) : null}
                          </td>
                          <td className="num">{w.matches}</td>
                          <td className="num">{renderWeekImpact(w)}</td>
                          <td className={`num ${w.losses > w.wins ? 'stat-loss' : 'stat-win'}`}>{recordText(w.wins, w.losses, w.draws)}</td>
                          <td className="num">{recordText(w.planWins, w.planLosses, w.planDraws)}</td>
                          <td className="num">{recordText(w.poolWins, w.poolLosses, w.poolDraws)}</td>
                          <td className="num">
                            {w.violationCount ? `${w.violationCount}${w.bannedCount ? ` (${w.bannedCount} proh.)` : ''} · ${w.violationLosses} D` : '—'}
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
                            <td colSpan={9}>{weekDetail(w)}</td>
                          </tr>
                        ) : null}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Móvil: una tarjeta por semana (sin tabla ancha) */}
              <div className="rules-weeks-cards">
                {pastWeeks.map((w) => (
                  <div key={w.key} className="rules-week-card">
                    <div className="rwc-head">
                      <b>{w.label}</b>
                      {w.days.every((d) => d.stored) ? (
                        <span className="rules-warn">· guardado</span>
                      ) : null}
                    </div>
                    <div className="rwc-row">
                      <span>Partidas</span>
                      <b>{w.matches}</b>
                      <span>FB/FD</span>
                      <b>{renderWeekImpact(w)}</b>
                    </div>
                    <div className="rwc-row">
                      <span>Récord real</span>
                      <b className={w.losses > w.wins ? 'stat-loss' : 'stat-win'}>{recordText(w.wins, w.losses, w.draws)}</b>
                      <span>Con regla</span>
                      <b>{recordText(w.planWins, w.planLosses, w.planDraws)}</b>
                    </div>
                    <div className="rwc-row">
                      <span>Regla+pool</span>
                      <b>{recordText(w.poolWins, w.poolLosses, w.poolDraws)}</b>
                      <span>Fuera de pool</span>
                      <b>
                        {w.violationCount
                          ? `${w.violationCount}${w.bannedCount ? ` (${w.bannedCount} proh.)` : ''} · ${w.violationLosses} D`
                          : '—'}
                      </b>
                    </div>
                    <div className="rwc-row">
                      <span>Cortes</span>
                      <b>{w.cutsTotal ? `${w.cutsIgnored}/${w.cutsTotal} ignorados` : '—'}</b>
                      <span />
                      <span />
                    </div>
                    <button
                      className="f-chip"
                      onClick={() => setOpenWeek(openWeek === w.key ? null : w.key)}
                      aria-expanded={openWeek === w.key}
                    >
                      {openWeek === w.key ? 'Ver menos' : 'Ver más'}
                    </button>
                    {openWeek === w.key ? <div className="rwc-detail">{weekDetail(w)}</div> : null}
                  </div>
                ))}
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
