export interface ValAccount {
  gameName: string;
  tagLine: string;
  puuid?: string;
}

export interface ValKpis {
  matches: number;
  wins: number;
  losses: number;
  wr: number;
  kd: number;
  acs: number;
  adr: number;
  hsPct: number;
}

export interface GroupRow {
  name: string;
  matches: number;
  wins: number;
  wr: number;
  kd: number;
  acs: number;
  adr: number;
  hsPct: number;
}

export interface MatchRow {
  matchId: string;
  date: string;
  timestamp: number;
  map: string;
  agent: string;
  won: boolean;
  rounds: number;
  roundsWon: number;
  roundsLost: number;
  kills: number;
  deaths: number;
  assists: number;
  acs: number;
  adr: number;
  hsPct: number;
  /** Totales crudos para agregar por día con precisión (opcional, proveedor Henrik/Riot) */
  score?: number;
  damageDealt?: number;
  headshots?: number;
  shots?: number;
  tier: number;
  tierChange: number;
  durationMin: number;
  rrDelta?: number | null;
  rr?: number | null;
  elo?: number | null;
  eloDelta?: number | null;
  agentIcon?: string | null;
  mapIcon?: string | null;
}

export interface ValSummary {
  generatedAt: string;
  account: ValAccount;
  window: {
    days: number;
    since: string;
    fetchedMatches: number;
    consideredMatches: number;
    seasonShort?: string | null;
    rrTotal?: number | null;
    eloTotal?: number | null;
    /** Bucket Henrik: fecha ISO de la última sincronización contra la API */
    syncedAt?: string | null;
  };
  kpis: ValKpis;
  currentTier: number;
  startTier: number;
  currentElo?: number | null;
  byAgent: (GroupRow & { agent: string })[];
  byMap: (GroupRow & { map: string })[];
  matches: MatchRow[];
}

export interface ValStatus {
  keyConfigured: boolean;
  provider: 'henrik' | 'riot' | null;
  ok: boolean;
  error?: { code: string; message: string };
}

export interface AgentIconInfo {
  name: string;
  icon: string | null;
}
