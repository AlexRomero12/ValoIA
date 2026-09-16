import type { AperturaBucket, AperturaGrupo, AperturaPartida, ArsenalRow, MatchRow, ValAperturas, ValArsenal, ValKpis, ValSummary } from './types';
import { computeStats, groupMatches, toStatBlock, type PlayerStats } from './stats';

export interface CompareFilters {
  agents: string[];
  map: string;
  from: string;
  to: string;
  minGames: number;
}

export const DEFAULT_FILTERS: CompareFilters = {
  agents: [],
  map: '',
  from: '',
  to: '',
  minGames: 0,
};

export function applyFilters(ms: MatchRow[], f: CompareFilters): MatchRow[] {
  const from = f.from ? Date.parse(`${f.from}T00:00:00`) : null;
  // `to` es exclusivo (inicio del día siguiente): con T23:59:59 se perdía el
  // último segundo del día (p. ej. una partida a las 23:59:59.500).
  const to = f.to ? Date.parse(`${f.to}T00:00:00`) + 24 * 60 * 60 * 1000 : null;
  const agentSet = f.agents.length ? new Set(f.agents) : null;
  return ms.filter((m) => {
    if (agentSet && !agentSet.has(m.agent)) return false;
    if (f.map && m.map !== f.map) return false;
    if (from != null && m.timestamp < from) return false;
    if (to != null && m.timestamp >= to) return false;
    return true;
  });
}

export type ResolvedGranularity = 'day' | 'week';
export type Granularity = ResolvedGranularity | 'auto';
export type MetricKey = 'wr' | 'acs' | 'kd' | 'rank';

/** Fila jugador × agente con stats completas (detalle de escritorio y tarjetas móviles). */
export interface AgentCombo {
  playerId: string;
  agent: string;
  stats: PlayerStats;
}

/** Agrupa las partidas filtradas de cada jugador por agente y calcula sus stats. */
export function agentCombos(
  players: { id: string; matches: MatchRow[] }[],
  filters: CompareFilters,
  minGames: number,
): AgentCombo[] {
  const out: AgentCombo[] = [];
  for (const p of players) {
    const filtered = applyFilters(p.matches, filters);
    const byAgent = new Map<string, MatchRow[]>();
    for (const m of filtered) {
      const list = byAgent.get(m.agent);
      if (list) list.push(m);
      else byAgent.set(m.agent, [m]);
    }
    for (const [agent, ms] of byAgent) {
      const stats = computeStats(ms);
      if (stats.games < minGames) continue;
      out.push({ playerId: p.id, agent, stats });
    }
  }
  return out;
}

/** Celda de la matriz agente × jugador (heatmap de escritorio y vista "Por agente" móvil). */
export interface AgentMatrixCell {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  wr: number;
}

export interface AgentMatrix {
  /** Agentes ordenados por partidas totales (desc). */
  agents: string[];
  /** Clave `jugador|agente` → celda. */
  cells: Map<string, AgentMatrixCell>;
  /** Partidas totales por agente. */
  totals: Map<string, number>;
}

export function agentMatrix(
  players: { id: string; matches: MatchRow[] }[],
  filters: CompareFilters,
): AgentMatrix {
  const cells = new Map<string, AgentMatrixCell>();
  const totals = new Map<string, number>();
  for (const p of players) {
    const filtered = applyFilters(p.matches, filters);
    for (const m of filtered) {
      const key = `${p.id}|${m.agent}`;
      const c = cells.get(key) ?? { games: 0, wins: 0, losses: 0, draws: 0, wr: 0 };
      c.games += 1;
      // Empate: no cuenta como victoria ni derrota (misma regla que computeStats).
      if (m.roundsWon === m.roundsLost) c.draws += 1;
      else if (m.won) c.wins += 1;
      cells.set(key, c);
      totals.set(m.agent, (totals.get(m.agent) ?? 0) + 1);
    }
  }
  for (const c of cells.values()) {
    const decisive = c.games - c.draws;
    c.losses = decisive - c.wins;
    c.wr = decisive ? (c.wins / decisive) * 100 : 0;
  }
  const agents = [...totals.keys()].sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0));
  return { agents, cells, totals };
}

/**
 * Granularidad efectiva para el modo "auto": rango corto (<=31 días) → día
 * (se ven todos los días), rango grande → semana (pocos puntos en el eje X).
 */
export function resolveGranularity(gran: Granularity, spanDays: number): ResolvedGranularity {
  if (gran !== 'auto') return gran;
  return spanDays <= 31 ? 'day' : 'week';
}

export interface BucketPoint {
  key: string;
  label: string;
  value: number | null;
  games: number;
  /** Punto aproximado (tier sin respaldo del mmr-history): se dibuja hueco. */
  approx?: boolean;
}

// ---------- Rango (tier + RR) como métrica ----------

/**
 * Puntos de rango de una partida: tier * 100 + RR dentro del tier
 * (P3 = 1700-1799, D1 = 1800-1899, D2 = 1900-1999…). Continuo entre tiers:
 * subir de P3 100 RR = caer en D1 0 RR. null si no hay tier (Unrated).
 *
 * Sin clamp superior a propósito: el RR real puede pasar de 100
 * (derank protection, refunds) y Radiant juega a cientos de RR
 * (tier 27 + RR real, p. ej. 2700+350). Clampearlo aplanaba esos casos
 * y confundía los bordes de tier (P3·100 == D1·0).
 */
export function rankPointsOf(m: MatchRow): number | null {
  if (typeof m.tier !== 'number' || m.tier <= 0) return null;
  const rr = typeof m.rr === 'number' && Number.isFinite(m.rr) ? m.rr : 0;
  return m.tier * 100 + Math.max(0, rr);
}

/** Piso del eje Y de la métrica de rango: Platinum 3 (no mostrar rangos más bajos). */
export const RANK_AXIS_MIN = 17 * 100;

function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

function keyFor(ts: number, gran: ResolvedGranularity): { key: string; label: string } {
  const d = new Date(ts);
  if (gran === 'day') {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { key, label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` };
  }
  const mo = mondayOf(d);
  // Semana con mes 1-indexado y pads (mismo formato que lib/rules.ts): sin pad,
  // el orden lexicográfico rompía el eje X (w-2026-7-11 < w-2026-7-4).
  const key = `w-${mo.getFullYear()}-${String(mo.getMonth() + 1).padStart(2, '0')}-${String(mo.getDate()).padStart(2, '0')}`;
  return { key, label: `${String(mo.getDate()).padStart(2, '0')}/${String(mo.getMonth() + 1).padStart(2, '0')}` };
}

interface BucketAcc {
  key: string;
  label: string;
  ms: MatchRow[];
}

export function buildTimeline(
  ms: MatchRow[],
  gran: ResolvedGranularity,
  metric: MetricKey,
  opts?: { fillEmptyDays?: boolean; fromTs?: number | null; toTs?: number | null },
): BucketPoint[] {
  // RANGO: un punto por partida, en orden cronológico. Colapsar el día/semana
  // a la última partida ocultaba promociones y deranks intermedios
  // (un día D1→D3→D1 se graficaba como un solo punto D1).
  if (metric === 'rank') {
    return [...ms]
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((m, i) => {
        const { key, label } = keyFor(m.timestamp, gran);
        return { key: `${key}#${m.timestamp}-${i}`, label, value: rankPointsOf(m), games: 1, approx: m.tierApprox ?? false };
      });
  }
  const accs = new Map<string, BucketAcc>();
  for (const m of ms) {
    const { key, label } = keyFor(m.timestamp, gran);
    let a = accs.get(key);
    if (!a) {
      a = { key, label, ms: [] };
      accs.set(key, a);
    }
    a.ms.push(m);
  }

  const buckets = [...accs.values()]
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((a) => {
      const s = computeStats(a.ms);
      let value: number | null = null;
      if (metric === 'wr') value = s.games - s.draws ? s.wr : null;
      else if (metric === 'acs') value = s.games ? s.acs : null;
      // 'rank' retorna antes (un punto por partida); aquí solo queda 'kd'.
      else value = s.games ? s.kd : null;
      return { key: a.key, label: a.label, value, games: s.games };
    });

  // Relleno de días vacíos: en rangos cortos (una semana, p. ej.) el eje X
  // muestra todos los días aunque no haya partidas (value null = hueco en
  // la línea). En rangos grandes no se rellena para no saturar el eje.
  if (gran === 'day' && opts?.fillEmptyDays) {
    const startTs = opts.fromTs ?? (ms.length ? Math.min(...ms.map((m) => m.timestamp)) : null);
    const endTs = opts.toTs ?? (ms.length ? Math.max(...ms.map((m) => m.timestamp)) : null);
    if (startTs != null && endTs != null && endTs >= startTs) {
      const byKey = new Map(buckets.map((b) => [b.key, b]));
      const out: typeof buckets = [];
      const cur = new Date(startTs);
      cur.setHours(0, 0, 0, 0);
      const end = new Date(endTs);
      end.setHours(0, 0, 0, 0);
      // Seguridad: el relleno solo tiene sentido en rangos cortos.
      const totalDays = Math.round((end.getTime() - cur.getTime()) / 86_400_000) + 1;
      if (totalDays >= 1 && totalDays <= 62) {
        for (let d = new Date(cur); d <= end; d.setDate(d.getDate() + 1)) {
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
          out.push(byKey.get(key) ?? { key, label, value: null, games: 0 });
        }
        return out;
      }
    }
  }
  return buckets;
}

export function unionOf(msLists: MatchRow[][], pick: (m: MatchRow) => string): string[] {
  const set = new Set<string>();
  for (const list of msLists) for (const m of list) set.add(pick(m));
  return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * Mezcla los summaries de las cuentas de un jugador (multi-cuenta):
 *  - Partidas unidas y deduplicadas por matchId (si dos cuentas jugaron el mismo
 *    game el mismo partido no se cuenta doble).
 *  - Rango (tier/elo) de la cuenta que esté mejor clasificada, sin reescalar el
 *    elo de una cuenta contra otra (cada una conserva su propio número).
 */
export function mergeAccountSummaries(summaries: (ValSummary | undefined)[]): ValSummary | undefined {
  const ok = summaries.filter((s): s is ValSummary => s != null);
  if (ok.length === 0) return undefined;
  if (ok.length === 1) return ok[0];

  const seen = new Set<string>();
  const matches: MatchRow[] = [];
  for (const s of ok) {
    for (const m of s.matches) {
      const id = m.matchId;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      // Etiqueta la cuenta de origen: con varias cuentas, la UI distingue quién jugó cada partida.
      matches.push({ ...m, accountName: s.account.gameName, accountTag: s.account.tagLine });
    }
  }
  matches.sort((a, b) => b.timestamp - a.timestamp);

  let best = ok[0];
  for (const s of ok.slice(1)) {
    if ((s.currentElo ?? -1) > (best.currentElo ?? -1)) best = s;
  }

  const st = computeStats(matches);
  const fetchedMatches = ok.reduce((a, s) => a + (s.window?.fetchedMatches ?? 0), 0);
  const archivedMatches = ok.reduce((a, s) => a + (s.window?.archivedMatches ?? 0), 0);
  const syncedAt = ok.reduce<string | null>(
    (a, s) => ((s.window?.syncedAt ?? '') > (a ?? '') ? (s.window.syncedAt ?? null) : a),
    null,
  );
  const mmrSyncedAt = ok.reduce<string | null>(
    (a, s) => ((s.window?.mmrSyncedAt ?? '') > (a ?? '') ? s.window.mmrSyncedAt ?? null : a),
    null,
  );
  const truncated = ok.some((s) => s.window?.truncated === true);
  const since = ok.reduce((a, s) => ((s.window?.since ?? '') < (a ?? '') ? s.window.since : a), ok[0].window.since);

  // Agregados por agente/mapa y arsenal: se recalculan sobre las partidas
  // mezcladas para que Ranked (que usa `byAgent`/`byMap`/`arsenal`) muestre
  // las stats combinadas de todas las cuentas.
  const groupsOf = (pick: (m: MatchRow) => string) =>
    [...groupMatches(matches, pick).entries()]
      .map(([key, list]) => ({
        key,
        name: key,
        ...toStatBlock(computeStats(list)),
      }))
      .sort((a, b) => b.matches - a.matches);

  const byAgent = groupsOf((m) => m.agent).map(({ key, ...g }) => ({ agent: key, ...g }));
  const byMap = groupsOf((m) => m.map).map(({ key, ...g }) => ({ map: key, ...g }));
  const arsenal = mergeArsenal(ok.map((s) => s.arsenal).filter((a): a is ValArsenal => a != null));
  const prev = mergePrevKpis(ok.map((s) => s.prev).filter((p): p is ValKpis => p != null));

  return {
    generatedAt: ok[0].generatedAt,
    account: best.account,
    window: {
      days: ok[0].window?.days ?? 0,
      since: since ?? '',
      fetchedMatches,
      consideredMatches: matches.length,
      archivedMatches,
      seasonShort: ok[0].window?.seasonShort ?? null,
      rrTotal: st.rrTotal,
      rrMissing: st.rrMissing,
      eloTotal: null,
      syncedAt,
      mmrSyncedAt,
      truncated,
    },
    kpis: {
      matches: st.games,
      wins: st.wins,
      losses: st.losses,
      draws: st.draws,
      wr: st.wr,
      kd: st.kd,
      acs: st.acs,
      adr: st.adr,
      hsPct: st.hsPct,
      fb: st.fb,
      fd: st.fd,
    },
    prev,
    currentTier: best.currentTier,
    startTier: best.startTier,
    currentElo: best.currentElo,
    currentRR: best.currentRR,
    byAgent,
    byMap,
    matches,
    arsenal,
    aperturas: mergeAperturas(ok.map((s) => s.aperturas).filter((a): a is ValAperturas => a != null)),
  };
}

/** Copia de un bucket (para no mutar los summaries de origen al combinar cuentas). */
function cloneBucket(b: AperturaBucket): AperturaBucket {
  return { ...b };
}

function sumBucket(target: AperturaBucket, source: AperturaBucket): void {
  target.rounds += source.rounds;
  target.fd += source.fd;
  target.fdWon += source.fdWon;
  target.noFd += source.noFd;
  target.noFdWon += source.noFdWon;
  target.fb += source.fb;
  target.fbWon += source.fbWon;
  target.fbLost += source.fbLost;
}

/** Grupos (mapa/agente) de varias cuentas: suma por nombre y ordena por rondas. */
function mergeAperturaGrupos(list: AperturaGrupo[][]): AperturaGrupo[] {
  const byName = new Map<string, AperturaGrupo>();
  for (const grupos of list) {
    for (const g of grupos) {
      const prev = byName.get(g.name);
      if (!prev) {
        byName.set(g.name, {
          name: g.name,
          total: cloneBucket(g.total),
          atk: cloneBucket(g.atk),
          def: cloneBucket(g.def),
          atkMatches: g.atkMatches,
          defMatches: g.defMatches,
        });
        continue;
      }
      sumBucket(prev.total, g.total);
      sumBucket(prev.atk, g.atk);
      sumBucket(prev.def, g.def);
      prev.atkMatches += g.atkMatches;
      prev.defMatches += g.defMatches;
    }
  }
  return [...byName.values()].sort((a, b) => b.total.rounds - a.total.rounds || a.name.localeCompare(b.name));
}

/** Aperturas combinadas de varias cuentas (dedupe de partidas por matchId). */
export function mergeAperturas(list: ValAperturas[]): ValAperturas | undefined {
  if (list.length === 0) return undefined;
  if (list.length === 1) return list[0];
  const total: AperturaBucket = { rounds: 0, fd: 0, fdWon: 0, noFd: 0, noFdWon: 0, fb: 0, fbWon: 0, fbLost: 0 };
  const atk: AperturaBucket = { ...total };
  const def: AperturaBucket = { ...total };
  let sinLado = 0;
  const seen = new Set<string>();
  const matches: AperturaPartida[] = [];
  for (const a of list) {
    sumBucket(total, a.total);
    sumBucket(atk, a.atk);
    sumBucket(def, a.def);
    sinLado += a.sinLado;
    for (const p of a.matches) {
      if (p.matchId && seen.has(p.matchId)) continue;
      if (p.matchId) seen.add(p.matchId);
      matches.push(p);
    }
  }
  matches.sort((a, b) => (a.date < b.date ? 1 : -1));
  return {
    total,
    atk,
    def,
    sinLado,
    byMap: mergeAperturaGrupos(list.map((a) => a.byMap)),
    byAgent: mergeAperturaGrupos(list.map((a) => a.byAgent)),
    matches,
  };
}

/** Suma el uso de armas de varias cuentas (dedupe por arma). */
function mergeArsenal(list: ValArsenal[]): ValArsenal | undefined {
  if (list.length === 0) return undefined;
  const byWeapon = new Map<string, ArsenalRow>();
  for (const a of list) {
    for (const r of a.rows) {
      const prev = byWeapon.get(r.weapon);
      if (!prev) {
        byWeapon.set(r.weapon, { ...r });
        continue;
      }
      prev.kills += r.kills;
      prev.deaths += r.deaths;
      prev.firstBloods += r.firstBloods;
      prev.kd = prev.deaths ? prev.kills / prev.deaths : prev.kills;
    }
  }
  return {
    rows: [...byWeapon.values()].sort((a, b) => b.kills - a.kills || b.deaths - a.deaths),
    totalKills: list.reduce((a, s) => a + s.totalKills, 0),
    totalFirstBloods: list.reduce((a, s) => a + s.totalFirstBloods, 0),
  };
}

/**
 * Ventana anterior combinada de varias cuentas: se agregan V-D-E y se ponderan
 * las medias por partidas (aproximación suficiente para los deltas de KPIs).
 */
function mergePrevKpis(list: ValKpis[]): ValKpis | null {
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];
  const total = list.reduce((a, p) => a + p.matches, 0);
  if (!total) return null;
  const weighted = (pick: (p: ValKpis) => number | undefined): number | undefined => {
    let sum = 0;
    let weight = 0;
    for (const p of list) {
      const v = pick(p);
      if (v == null || !Number.isFinite(v)) continue;
      sum += v * p.matches;
      weight += p.matches;
    }
    return weight ? sum / weight : undefined;
  };
  const wins = list.reduce((a, p) => a + p.wins, 0);
  const draws = list.reduce((a, p) => a + (p.draws ?? 0), 0);
  const decisive = total - draws;
  return {
    matches: total,
    wins,
    losses: total - wins - draws,
    draws,
    wr: decisive ? (wins / decisive) * 100 : 0,
    kd: weighted((p) => p.kd) ?? 0,
    acs: Math.round(weighted((p) => p.acs) ?? 0),
    adr: Math.round(weighted((p) => p.adr) ?? 0),
    hsPct: weighted((p) => p.hsPct) ?? 0,
    fb: weighted((p) => p.fb),
    fd: weighted((p) => p.fd),
  };
}
