import type { MatchRow, ValSummary } from './types';

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
  const to = f.to ? Date.parse(`${f.to}T23:59:59`) : null;
  const agentSet = f.agents.length ? new Set(f.agents) : null;
  return ms.filter((m) => {
    if (agentSet && !agentSet.has(m.agent)) return false;
    if (f.map && m.map !== f.map) return false;
    if (from != null && m.timestamp < from) return false;
    if (to != null && m.timestamp > to) return false;
    return true;
  });
}

export interface PlayerStats {
  games: number;
  wins: number;
  losses: number;
  wr: number;
  kd: number;
  acs: number;
  adr: number;
  hsPct: number;
  rrTotal: number | null;
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
  let rounds = 0;
  let rr = 0;
  let hasRr = false;

  for (const m of ms) {
    // Empate (marcador igualado): no cuenta ni como victoria ni como derrota.
    if (m.roundsWon === m.roundsLost) draws += 1;
    else if (m.won) wins += 1;
    kills += m.kills;
    deaths += m.deaths;
    scoreW += m.acs * Math.max(1, m.rounds);
    dmgW += m.adr * Math.max(1, m.rounds);
    hsW += m.hsPct * Math.max(1, m.rounds);
    rounds += Math.max(1, m.rounds);
    if (m.rrDelta != null) {
      rr += m.rrDelta;
      hasRr = true;
    }
  }
  const games = ms.length;
  const decisive = games - draws;
  return {
    games,
    wins,
    losses: games - wins - draws,
    wr: decisive ? (wins / decisive) * 100 : 0,
    kd: deaths ? kills / deaths : kills > 0 ? kills : 0,
    acs: rounds ? scoreW / rounds : 0,
    adr: rounds ? dmgW / rounds : 0,
    hsPct: rounds ? hsW / rounds : 0,
    rrTotal: hasRr ? rr : null,
  };
}

export type Granularity = 'day' | 'week';
export type MetricKey = 'wr' | 'acs' | 'kd' | 'elo';

export interface BucketPoint {
  key: string;
  label: string;
  value: number | null;
  games: number;
}

function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

function keyFor(ts: number, gran: Granularity): { key: string; label: string } {
  const d = new Date(ts);
  if (gran === 'day') {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { key, label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` };
  }
  const mo = mondayOf(d);
  const key = `w-${mo.getFullYear()}-${mo.getMonth()}-${mo.getDate()}`;
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
  eloVal: number | null;
  eloTs: number;
}

export function buildTimeline(
  ms: MatchRow[],
  gran: Granularity,
  metric: MetricKey,
): BucketPoint[] {
  const accs = new Map<string, Acc>();
  for (const m of ms) {
    const { key, label } = keyFor(m.timestamp, gran);
    let a = accs.get(key);
    if (!a) {
      a = { key, label, games: 0, wins: 0, draws: 0, kills: 0, deaths: 0, acsW: 0, rounds: 0, eloVal: null, eloTs: -Infinity };
      accs.set(key, a);
    }
    a.games += 1;
    if (m.roundsWon === m.roundsLost) a.draws += 1;
    else if (m.won) a.wins += 1;
    a.kills += m.kills;
    a.deaths += m.deaths;
    a.acsW += m.acs * Math.max(1, m.rounds);
    a.rounds += Math.max(1, m.rounds);
    if (typeof m.elo === 'number' && Number.isFinite(m.elo) && m.timestamp >= a.eloTs) {
      a.eloTs = m.timestamp;
      a.eloVal = m.elo;
    }
  }

  return [...accs.values()]
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((a) => {
      let value: number | null = null;
      if (metric === 'wr') value = a.games - a.draws ? (a.wins / (a.games - a.draws)) * 100 : null;
      else if (metric === 'acs') value = a.rounds ? a.acsW / a.rounds : null;
      else if (metric === 'elo') value = a.eloVal;
      else value = a.deaths ? a.kills / a.deaths : a.games ? 0 : null;
      return { key: a.key, label: a.label, value, games: a.games };
    });
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
      matches.push(m);
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
  const since = ok.reduce((a, s) => ((s.window?.since ?? '') < (a ?? '') ? s.window.since : a), ok[0].window.since);

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
      rrTotal: null,
      eloTotal: null,
      syncedAt,
    },
    kpis: {
      matches: st.games,
      wins: st.wins,
      losses: st.losses,
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
    byAgent: [],
    byMap: [],
    matches,
  };
}
