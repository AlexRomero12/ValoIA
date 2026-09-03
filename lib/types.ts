export interface ValAccount {
  gameName: string;
  tagLine: string;
  puuid?: string;
}

export interface ValKpis {
  matches: number;
  wins: number;
  losses: number;
  /** Empates (marcador igualado): no cuentan como victorias ni derrotas */
  draws?: number;
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
  /** Empates (marcador igualado): no cuentan como victorias ni derrotas */
  draws?: number;
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
  /** Rol del agente (Duelist/Initiator/Controller/Sentinel) */
  agentRole?: string | null;
}

export interface ArsenalRow {
  weapon: string;
  /** Categoría del arma (Rifle, Sniper, Melee...) según valorant-api.com */
  type: string | null;
  icon: string | null;
  kills: number;
  deaths: number;
  kd: number;
  /** Primeras sangre del jugador con esta arma (primer kill del round) */
  firstBloods: number;
}

export interface ValArsenal {
  rows: ArsenalRow[];
  totalKills: number;
  totalFirstBloods: number;
}

export interface ValSummary {
  generatedAt: string;
  account: ValAccount;
  window: {
    days: number;
    since: string;
    fetchedMatches: number;
    consideredMatches: number;
    /** Partidas en el archivo acumulativo (histórico completo sincronizado) */
    archivedMatches?: number;
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
  /** Puntos de rango (RR dentro del tier actual, 0-100). Solo proveedor Henrik. */
  currentRR?: number | null;
  byAgent: (GroupRow & { agent: string })[];
  byMap: (GroupRow & { map: string })[];
  matches: MatchRow[];
  /** Solo proveedor Henrik: uso de armas derivado del kill feed */
  arsenal?: ValArsenal;
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
