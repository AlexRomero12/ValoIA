import type { ArsenalRow, MatchRow, ValArsenal, ValSummary } from './types';

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

export interface PlayerStats {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  wr: number;
  kd: number;
  acs: number;
  adr: number;
  hsPct: number;
  rrTotal: number | null;
  /** Partidas sin dato de RR (la API solo devuelve ~20 recientes): rrTotal es parcial si > 0. */
  rrMissing: number;
}

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function statsFromMatches(ms: MatchRow[]): PlayerStats {
  let wins = 0;
  let draws = 0;
  let kills = 0;
  let deaths = 0;
  let scoreW = 0;
  let dmgW = 0;
  let hsW = 0;
  let hsRaw = 0;
  let shotsRaw = 0;
  let rounds = 0;
  let rr = 0;
  let hasRr = false;
  let rrMissing = 0;

  for (const m of ms) {
    // Empate (marcador igualado): no cuenta ni como victoria ni como derrota.
    if (m.roundsWon === m.roundsLost) draws += 1;
    else if (m.won) wins += 1;
    kills += m.kills;
    deaths += m.deaths;
    // Totales crudos cuando existen (misma regla que dayAnalysis.ts): reconstruir
    // desde el ACS/ADR redondeado mete hasta ±0.5 por partida y diverge entre vistas.
    const rds = Math.max(1, m.rounds);
    scoreW += m.score ?? m.acs * rds;
    dmgW += m.damageDealt ?? m.adr * rds;
    hsW += m.hsPct * rds;
    hsRaw += m.headshots ?? 0;
    shotsRaw += m.shots ?? 0;
    rounds += rds;
    if (m.rrDelta != null) {
      rr += m.rrDelta;
      hasRr = true;
    } else {
      rrMissing += 1;
    }
  }
  const games = ms.length;
  const decisive = games - draws;
  return {
    games,
    wins,
    losses: games - wins - draws,
    draws,
    wr: decisive ? (wins / decisive) * 100 : 0,
    kd: deaths ? kills / deaths : kills > 0 ? kills : 0,
    acs: rounds ? scoreW / rounds : 0,
    adr: rounds ? dmgW / rounds : 0,
    // HS% por conteo directo cuando hay crudos; si no (proveedor Riot),
    // promedio ponderado del HS% por partida.
    hsPct: shotsRaw ? (hsRaw / shotsRaw) * 100 : rounds ? hsW / rounds : 0,
    rrTotal: hasRr ? rr : null,
    rrMissing,
  };
}

export type ResolvedGranularity = 'day' | 'week';
export type Granularity = ResolvedGranularity | 'auto';
export type MetricKey = 'wr' | 'acs' | 'kd' | 'rank';

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

const TIER_SHORT: Record<number, string> = {
  0: 'UR', 3: 'I1', 4: 'I2', 5: 'I3',
  6: 'B1', 7: 'B2', 8: 'B3',
  9: 'S1', 10: 'S2', 11: 'S3',
  12: 'G1', 13: 'G2', 14: 'G3',
  15: 'P1', 16: 'P2', 17: 'P3',
  18: 'D1', 19: 'D2', 20: 'D3',
  21: 'A1', 22: 'A2', 23: 'A3',
  24: 'IM1', 25: 'IM2', 26: 'IM3',
  27: 'RAD',
};

/** Nombre corto de un tier (17 → "P3", 18 → "D1", 27+ → "RAD"). */
export function tierShort(tier: number): string {
  if (tier >= 27) return 'RAD';
  return TIER_SHORT[tier] ?? `T${tier}`;
}

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
  // Semana con mes 1-indexado y pads (mismo formato que lib/audit.ts): sin pad,
  // el orden lexicográfico rompía el eje X (w-2026-7-11 < w-2026-7-4).
  const key = `w-${mo.getFullYear()}-${String(mo.getMonth() + 1).padStart(2, '0')}-${String(mo.getDate()).padStart(2, '0')}`;
  return { key, label: `${String(mo.getDate()).padStart(2, '0')}/${String(mo.getMonth() + 1).padStart(2, '0')}` };
}

interface Acc {
  key: string;
  label: string;
  games: number;
  wins: number;
  draws: number;
  kills: number;
  deaths: number;
  acsW: number;
  rounds: number;
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
  const accs = new Map<string, Acc>();
  for (const m of ms) {
    const { key, label } = keyFor(m.timestamp, gran);
    let a = accs.get(key);
    if (!a) {
      a = { key, label, games: 0, wins: 0, draws: 0, kills: 0, deaths: 0, acsW: 0, rounds: 0 };
      accs.set(key, a);
    }
    a.games += 1;
    if (m.roundsWon === m.roundsLost) a.draws += 1;
    else if (m.won) a.wins += 1;
    a.kills += m.kills;
    a.deaths += m.deaths;
    a.acsW += m.acs * Math.max(1, m.rounds);
    a.rounds += Math.max(1, m.rounds);
  }

  const buckets = [...accs.values()]
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((a) => {
      let value: number | null = null;
      if (metric === 'wr') value = a.games - a.draws ? (a.wins / (a.games - a.draws)) * 100 : null;
      else if (metric === 'acs') value = a.rounds ? a.acsW / a.rounds : null;
      // 'rank' retorna antes (un punto por partida); aquí solo queda 'kd'.
      else value = a.deaths ? a.kills / a.deaths : a.games ? 0 : null;
      return { key: a.key, label: a.label, value, games: a.games };
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

  const st = statsFromMatches(matches);
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
  const groupsOf = (pick: (m: MatchRow) => string) => {
    const groups = new Map<string, MatchRow[]>();
    for (const m of matches) {
      const k = pick(m);
      const list = groups.get(k) ?? [];
      list.push(m);
      groups.set(k, list);
    }
    return [...groups.entries()]
      .map(([key, list]) => {
        const g = statsFromMatches(list);
        return {
          key,
          name: key,
          matches: g.games,
          wins: g.wins,
          draws: g.draws,
          wr: g.wr,
          kd: g.kd,
          acs: g.acs,
          adr: g.adr,
          hsPct: g.hsPct,
        };
      })
      .sort((a, b) => b.matches - a.matches);
  };

  const byAgent = groupsOf((m) => m.agent).map(({ key, ...g }) => ({ agent: key, ...g }));
  const byMap = groupsOf((m) => m.map).map(({ key, ...g }) => ({ map: key, ...g }));
  const arsenal = mergeArsenal(ok.map((s) => s.arsenal).filter((a): a is ValArsenal => a != null));

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
    },
    currentTier: best.currentTier,
    startTier: best.startTier,
    currentElo: best.currentElo,
    currentRR: best.currentRR,
    byAgent,
    byMap,
    matches,
    arsenal,
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
