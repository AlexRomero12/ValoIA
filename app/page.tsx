'use client';

import { useEffect, useMemo, useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { useAimlabData } from '@/lib/useAimlabData';
import { useCooldown } from '@/lib/useCooldown';

export default function AimLabPage() {
  const query = useAimlabData(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const cooldown = useCooldown(60);
  const [taskId, setTaskId] = useState('');

  const data = query.data;
  const error = query.error as Error | null;

  const refresh = async () => {
    if (isRefreshing || cooldown.locked) return;
    setIsRefreshing(true);
    try {
      await fetch('/api/data?days=14&refresh=1');
      await query.refetch();
    } finally {
      setIsRefreshing(false);
      cooldown.trigger();
    }
  };

  const updated = data ? `actualizado ${new Date(data.generatedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}` : null;
  const p = data?.profile;

  return (
    <div className="wrap" style={{ ['--accent-nav' as string]: '#35b6ff', ['--accent-kpi' as string]: '#35b6ff', ['--accent-tick' as string]: '#35b6ff', ['--accent-focus' as string]: '#35b6ff', ['--accent-row' as string]: '#35b6ff' }}>
      <TopBar
        accent="blue"
        title="Aim Lab"
        subtitle={['Aim Lab', 'Report']}
        chip={
          <span className="chip-blue">
            {p ? `${p.username} · ${p.rankDisplay ?? 'sin rango'} · skill ${Math.round(p.skill ?? 0)}` : 'cargando…'}
          </span>
        }
        updated={updated}
        onRefresh={refresh}
        loading={isRefreshing}
        disabled={cooldown.locked}
        activePage="aim"
      />

      {error && <div className="banner error">{error.message}</div>}

      {data && (
        <>
          <div className="grid-aim">
            <div className="col">
              <div className="panel focus-card">
                <h2 className="panel-h2">Enfoque de hoy</h2>
                <p className="msg">{data.focus.message}</p>
                <div>
                  {data.focus.recommended.length
                    ? data.focus.recommended.map((r) => (
                        <div key={r.taskId} className="rec">
                          <span className="sc">{r.taskName}</span>
                          <div className="meta">{r.category} / {r.subcategory} · precisión {(r.bestAccuracy ?? 0).toFixed(1)}%</div>
                        </div>
                      ))
                    : <div className="rec muted">Sin datos de escenarios jugados aún.</div>}
                </div>
              </div>

              <div className="panel">
                <h2 className="panel-h2">Habilidades</h2>
                <SkillBars scores={p?.skillScores ?? []} />
              </div>
            </div>

            <div className="col">
              <div className="panel">
                <h2 className="panel-h2">Sesión · por escenario</h2>
                <ScenarioSelect days={data.days} value={taskId} onChange={setTaskId} />
                {taskId ? (
                  <ExerciseChart days={data.days} taskId={taskId} />
                ) : (
                  <TodayChart day={data.days[data.days.length - 1]} />
                )}
              </div>
            </div>
          </div>

          <div className="two-col">
            <div className="panel">
              <h2 className="panel-h2">Sesión de hoy</h2>
              <TodayTable day={data.days[data.days.length - 1]} />
            </div>
            <div className="panel">
              <h2 className="panel-h2">Mejores puntajes</h2>
              <PbTable days={data.days} pbs={data.pbs} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SkillBars({ scores }: { scores: { name: string; score: number }[] }) {
  if (!scores.length) return <p className="empty">Sin datos de habilidades.</p>;
  return (
    <div>
      {[...scores]
        .sort((a, b) => a.score - b.score)
        .map((s) => {
          const hue = Math.round(190 - (s.score / 100) * 160);
          const col = `hsl(${Math.max(hue, 30)} 58% 52%)`;
          return (
            <div key={s.name} className="skill-row">
              <span className="name">{s.name}</span>
              <div className="track"><div className="fill" style={{ width: `${Math.max(2, s.score)}%`, background: col }} /></div>
              <span className="val">{Math.round(s.score)}</span>
            </div>
          );
        })}
    </div>
  );
}

function ScenarioSelect({ days, value, onChange }: { days: NonNullable<ReturnType<typeof useAimlabData>['data']>['days']; value: string; onChange: (v: string) => void }) {
  const today = days[days.length - 1]?.tasks ?? [];
  const options = [...today].sort((a, b) => a.taskName.localeCompare(b.taskName));
  return (
    <div className="chart-head">
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Sesión de hoy (barras)</option>
        {options.map((t) => (
          <option key={t.taskId} value={t.taskId}>{t.taskName}</option>
        ))}
      </select>
    </div>
  );
}

const LINE = '#20303f';
const MUTE = '#93a4b3';
const FAINT = '#5d7080';
const BONE = '#ece8e1';
const BLUE = '#35b6ff';

function TodayChart({ day }: { day?: ReturnType<typeof useAimlabData>['data'] extends null ? never : NonNullable<ReturnType<typeof useAimlabData>['data']>['days'][number] }) {
  if (!day || day.tasks.length === 0) {
    return <p className="empty">Juega tu rutina de hoy y los escenarios aparecerán aquí.</p>;
  }
  const rows = [...day.tasks].sort((a, b) => (a.bestAccuracy ?? 0) - (b.bestAccuracy ?? 0));
  const W = 800, H = 320, PL = 56, PR = 12, PT = 24, PB = 78;
  const chartW = W - PL - PR, chartH = H - PT - PB;
  const maxScore = Math.max(...rows.map((r) => r.bestScore ?? 0), 1);
  const slot = chartW / rows.length;
  const barW = Math.min(slot * 0.62, 56);
  const yAt = (v: number) => PT + chartH - (v / maxScore) * chartH;
  const heat = (acc: number | null | undefined) => {
    const a = Math.max(0, Math.min(100, acc ?? 0)) / 100;
    return `hsl(${Math.round(a * 130)} 58% 52%)`;
  };

  return (
    <>
      <div className="chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} role="img">
          {[0, 1, 2, 3, 4].map((g) => {
            const gy = PT + chartH - (g / 4) * chartH;
            return (
              <g key={g}>
                <line x1={PL} y1={gy} x2={W - PR} y2={gy} stroke={LINE} strokeWidth={1} />
                <text x={PL - 10} y={gy + 4} fontSize="10" fill={MUTE} textAnchor="end">{Math.round((g / 4) * maxScore)}</text>
              </g>
            );
          })}
          {rows.map((r, i) => {
            const cx = PL + slot * i + slot / 2;
            const score = r.bestScore ?? 0;
            const y0 = yAt(score);
            const name = r.taskName.replace(/^VT\s+/i, '').split(' ').slice(0, 3).join(' ');
            return (
              <g key={r.taskId}>
                <rect x={cx - barW / 2} y={y0} width={barW} height={Math.max(PT + chartH - y0, 2)} fill={heat(r.bestAccuracy)} opacity={0.92} />
                <text x={cx} y={y0 - 5} fontSize="10" fill={BONE} textAnchor="middle" fontWeight={600}>{Math.round(score)}</text>
                <text x={cx} y={y0 - 17} fontSize="9" fill={FAINT} textAnchor="middle">{r.runs} runs</text>
                <text x={cx} y={H - PB + 16} fontSize="9" fill={MUTE} textAnchor="middle" transform={`rotate(-38 ${cx} ${H - PB + 16})`}>{name}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="legend">
        <span><span className="sw" style={{ background: 'hsl(0 58% 52%)' }} />baja precisión</span>
        <span><span className="sw" style={{ background: 'hsl(65 58% 52%)' }} />media</span>
        <span><span className="sw" style={{ background: 'hsl(130 58% 52%)' }} />alta</span>
        <span>altura = mejor score de hoy</span>
      </div>
    </>
  );
}

function ExerciseChart({ days, taskId }: { days: NonNullable<ReturnType<typeof useAimlabData>['data']>['days']; taskId: string }) {
  const todayIdx = days.length - 1;
  const pts = useMemo(
    () =>
      days
        .map((d, i) => ({ i, date: d.date, y: d.byTask[taskId]?.bestScore ?? null }))
        .filter((p): p is typeof p & { y: number } => p.y != null)
        .sort((a, b) => (a.i === todayIdx ? -1 : b.i === todayIdx ? 1 : b.i - a.i)),
    [days, taskId, todayIdx],
  );

  if (!pts.length) return <p className="empty">Sin datos de este escenario.</p>;

  const maxScore = Math.max(...pts.map((p) => p.y), 1);
  const W = 800, H = 300, PL = 56, PR = 12, PT = 24, PB = 34;
  const chartW = W - PL - PR, chartH = H - PT - PB;
  const slot = chartW / pts.length;
  const barW = Math.min(slot * 0.62, 48);
  const yAt = (v: number) => PT + chartH - (v / maxScore) * chartH;

  return (
    <>
      <div className="chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} role="img">
          {[0, 1, 2, 3, 4].map((g) => {
            const gy = PT + chartH - (g / 4) * chartH;
            return (
              <g key={g}>
                <line x1={PL} y1={gy} x2={W - PR} y2={gy} stroke={LINE} strokeWidth={1} />
                <text x={PL - 10} y={gy + 4} fontSize="10" fill={MUTE} textAnchor="end">{Math.round((g / 4) * maxScore)}</text>
              </g>
            );
          })}
          {pts.map((p, k) => {
            const cx = PL + slot * k + slot / 2;
            const isToday = p.i === todayIdx;
            const color = isToday ? BLUE : '#3d5570';
            const y0 = yAt(p.y);
            return (
              <g key={k}>
                <text x={cx} y={H - PB + 16} fontSize="9" fill={FAINT} textAnchor="middle">{p.date.slice(5)}</text>
                <text x={cx} y={H - PB + 29} fontSize="8.5" fill={BLUE} textAnchor="middle" fontWeight={700}>{isToday ? 'HOY' : ''}</text>
                <rect x={cx - barW / 2} y={y0} width={barW} height={Math.max(PT + chartH - y0, 2)} fill={color} opacity={isToday ? 1 : 0.75} />
                <text x={cx} y={y0 - 5} fontSize="10" fill={BONE} textAnchor="middle" fontWeight={isToday ? 700 : 400}>{Math.round(p.y)}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <LegendForExercise pts={pts} todayIdx={todayIdx} days={days} taskId={taskId} />
    </>
  );
}

function LegendForExercise({ pts, todayIdx, days, taskId }: {
  pts: { i: number; date: string; y: number }[];
  todayIdx: number;
  days: NonNullable<ReturnType<typeof useAimlabData>['data']>['days'];
  taskId: string;
}) {
  const today = days[todayIdx]?.byTask[taskId];
  return (
    <div className="legend">
      <span><span className="sw" style={{ background: BLUE }} />hoy</span>
      <span><span className="sw" style={{ background: '#3d5570' }} />días anteriores</span>
      {today && pts.length ? (
        <span>
          hoy: {Math.round(pts.find((p) => p.i === todayIdx)?.y ?? today.bestScore)} pts · {today.runs} runs · {(today.bestAccuracy ?? 0).toFixed(1)}% precisión
        </span>
      ) : null}
    </div>
  );
}

function TodayTable({ day }: { day?: ReturnType<typeof useAimlabData>['data'] extends null ? never : NonNullable<ReturnType<typeof useAimlabData>['data']>['days'][number] }) {
  if (!day || day.tasks.length === 0) {
    return <p className="empty">Juega tu rutina de hoy y la sesión aparecerá aquí.</p>;
  }
  const rows = [...day.tasks].sort((a, b) => (a.bestAccuracy ?? 0) - (b.bestAccuracy ?? 0));
  return (
    <div className="table-scroll">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
        <thead>
          <tr>
            {['Escenario', 'Score', 'Precisión', 'Runs'].map((h, i) => (
              <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.taskId}>
              <td className="name">{t.taskName}</td>
              <td className="num">{Math.round(t.bestScore)}</td>
              <td className="num">{(t.bestAccuracy ?? 0).toFixed(1)}%</td>
              <td className="num">{t.runs}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PbTable({ days, pbs }: {
  days: NonNullable<ReturnType<typeof useAimlabData>['data']>['days'];
  pbs: NonNullable<ReturnType<typeof useAimlabData>['data']>['pbs'];
}) {
  const today = days[days.length - 1];
  const order = new Map(
    [...(today?.tasks ?? [])]
      .sort((a, b) => (a.bestAccuracy ?? 0) - (b.bestAccuracy ?? 0))
      .map((t, i) => [t.taskId, i]),
  );
  const list = pbs
    .filter((p) => order.has(p.taskId))
    .sort((a, b) => (order.get(a.taskId) ?? 0) - (order.get(b.taskId) ?? 0));

  if (!list.length) return <p className="empty">Los PBs de los escenarios de hoy aparecerán aquí.</p>;

  return (
    <div className="table-scroll">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
        <thead>
          <tr>
            {['Escenario', 'PB', 'Precisión', 'Runs'].map((h, i) => (
              <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.map((t) => (
            <tr key={t.taskId}>
              <td className="name">{t.taskName}</td>
              <td className="num">{t.bestScore != null ? Math.round(t.bestScore) : '—'}</td>
              <td className="num">{t.bestAccuracy != null ? t.bestAccuracy.toFixed(1) + '%' : '—'}</td>
              <td className="num">{t.runs}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
