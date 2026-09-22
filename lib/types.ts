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
  /** Primeras sangres por partida (promedio). Solo proveedor Henrik. */
  fb?: number;
  /** Primeras muertes por partida (promedio). Solo proveedor Henrik. */
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
  /** Primeras sangres del jugador (primer kill del round). Solo proveedor Henrik. */
  firstBloods?: number;
  /** Primeras muertes del jugador (primera muerte del round). Solo proveedor Henrik. */
  firstDeaths?: number;
  /** Totales crudos para agregar por día con precisión (opcional, proveedor Henrik/Riot) */
  score?: number;
  damageDealt?: number;
  headshots?: number;
  shots?: number;
  tier: number;
  tierChange: number;
  /** Tier sin respaldo del mmr-history (aproximado): el punto de rango lleva ~. */
  tierApprox?: boolean;
  durationMin: number;
  rrDelta?: number | null;
  rr?: number | null;
  elo?: number | null;
  eloDelta?: number | null;
  agentIcon?: string | null;
  mapIcon?: string | null;
  /** Rol del agente (Duelist/Initiator/Controller/Sentinel) */
  agentRole?: string | null;
  /** ACS promedio de los compañeros de equipo (detalle de la partida). */
  mateAcs?: number | null;
  /** Compañeros muy malos (≤155 ACS y ≤0.8 KD): etiquetado de derrotas. */
  mateBadCount?: number | null;
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

/** Conteos de aperturas de un conjunto de rondas (global, por bando o por grupo). */
export interface AperturaBucket {
  /** Rondas contadas (con bando conocido o no: se separa en `sinLado` global). */
  rounds: number;
  /** Rondas donde morí primero (FD). */
  fd: number;
  /** De las FD: rondas que ganó mi equipo. */
  fdWon: number;
  /** Rondas sin FD. */
  noFd: number;
  /** De las rondas sin FD: ganadas. */
  noFdWon: number;
  /** Rondas donde abrí con la primera sangre (FB). */
  fb: number;
  /** De las FB: rondas ganadas (conversión). */
  fbWon: number;
  /** De las FB: rondas perdidas (FB sin convertir). */
  fbLost: number;
}

/** Aperturas de un grupo (mapa o agente), separadas por bando. */
export interface AperturaGrupo {
  name: string;
  total: AperturaBucket;
  atk: AperturaBucket;
  def: AperturaBucket;
  /** Partidas del grupo con al menos una ronda de ataque (denominador de FD/part. ATK). */
  atkMatches: number;
  /** Partidas del grupo con al menos una ronda de defensa (denominador de FD/part. DEF). */
  defMatches: number;
}

/** Fila de partida para la revisión de aperturas (VOD). */
export interface AperturaPartida {
  matchId: string;
  date: string;
  map: string;
  agent: string;
  won: boolean;
  rounds: number;
  fd: number;
  fb: number;
  /** Rondas con tu primera sangre que se perdieron. */
  fbLost: number;
  /** Rondas del partido donde no se pudo inferir el bando. */
  sideUnknown: number;
}

/** Detalle por ronda de FB/FD (solo proveedor Henrik). */
export interface ValAperturas {
  total: AperturaBucket;
  atk: AperturaBucket;
  def: AperturaBucket;
  /** Rondas con bando indeterminado (sin plantas que lo revelen). */
  sinLado: number;
  byMap: AperturaGrupo[];
  byAgent: AperturaGrupo[];
  /** Más reciente primero. */
  matches: AperturaPartida[];
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
    /** Partidas de la ventana sin dato de RR: rrTotal es parcial si > 0. */
    rrMissing?: number;
    eloTotal?: number | null;
    /** Bucket Henrik: fecha ISO de la última sincronización contra la API */
    syncedAt?: string | null;
    /** MMR-history: fecha ISO de su última descarga (TTL distinto al bucket) */
    mmrSyncedAt?: string | null;
    /** La ventana puede estar recortada (bucket al tope sin cobertura total) */
    truncated?: boolean;
    /** true = la red falló (Riot/Henrik) y se sirvió desde el archivo/caché local */
    stale?: boolean;
    /** Fecha ISO de la última sincronización conocida cuando `stale` */
    cachedAt?: string | null;
    /** Motivo de la degradación (p. ej. "henrikdev HTTP 500") */
    degradedReason?: string | null;
  };
  kpis: ValKpis;
  /** Ventana anterior de igual duración (deltas de KPIs); null si no hay datos. */
  prev?: ValKpis | null;
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
  /** Solo proveedor Henrik: FB/FD por ronda con bando inferido (plantas) */
  aperturas?: ValAperturas;
}

export interface AgentIconInfo {
  name: string;
  icon: string | null;
  /** Rol del agente (Duelist/Initiator/Controller/Sentinel) */
  role?: string | null;
}
