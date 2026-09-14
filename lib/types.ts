export interface ValAccount {
  gameName: string;
  tagLine: string;
  puuid?: string;
  /** Identidad servida por el fallback del modo demo (sin dev key válida). */
  demo?: boolean;
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
  /** Primeras sangres por partida (promedio). */
  fb?: number;
  /** Primeras muertes por partida (promedio). */
  fd?: number;
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
  /** Primeras sangres del jugador (primer kill del round). */
  firstBloods?: number;
  /** Primeras muertes del jugador (primera muerte del round). */
  firstDeaths?: number;
  /** Totales crudos para agregar por día con precisión */
  score?: number;
  damageDealt?: number;
  headshots?: number;
  shots?: number;
  tier: number;
  tierChange: number;
  durationMin: number;
  agentIcon?: string | null;
  mapIcon?: string | null;
  /** Rol del agente (Duelist/Initiator/Controller/Sentinel) */
  agentRole?: string | null;
  /** Cuenta que jugó la partida (solo al combinar varias cuentas de un perfil). */
  accountName?: string;
  accountTag?: string;
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
    /** Origen de los datos de partidas: mock (dev) o live (key productiva) */
    source?: 'mock' | 'live';
    /** Bucket Riot: fecha ISO de la última sincronización */
    syncedAt?: string | null;
    /** La ventana puede estar recortada (bucket al tope sin cobertura total) */
    truncated?: boolean;
  };
  kpis: ValKpis;
  /** Ventana anterior de igual duración (deltas de KPIs); null si no hay datos. */
  prev?: ValKpis | null;
  currentTier: number;
  startTier: number;
  byAgent: (GroupRow & { agent: string })[];
  byMap: (GroupRow & { map: string })[];
  matches: MatchRow[];
  /** Uso de armas derivado del kill feed */
  arsenal?: ValArsenal;
}

export interface AgentIconInfo {
  name: string;
  icon: string | null;
  /** Rol del agente (Duelist/Initiator/Controller/Sentinel) */
  role?: string | null;
}
