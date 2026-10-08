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

/** Stats agregadas de un grupo (agente o mapa) tal como las emite la API. */
interface GroupStats {
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
  /** Desglose del cambio de RR (mmr-history v2 tal como lo publica v4.10). */
  rrDetail?: RrChangeDetail | null;
  agentIcon?: string | null;
  mapIcon?: string | null;
  /** Rol del agente (Duelist/Initiator/Controller/Sentinel) */
  agentRole?: string | null;
  /** ACS promedio de los compañeros de equipo (detalle de la partida). */
  mateAcs?: number | null;
  /** Compañeros muy malos (≤155 ACS y ≤0.8 KD): etiquetado de derrotas. */
  mateBadCount?: number | null;
  /** Puesto por ACS dentro del propio equipo (1 = top; rankings de competición). */
  teamRank?: number | null;
  /** Puesto por ACS entre los 10 de la partida (1 = top). */
  lobbyRank?: number | null;
  /** Compañeros de equipo ("nombre#tag" en minúsculas): análisis de aporte/stacks. */
  mates?: string[];
  /** Cuenta que jugó la partida (solo al combinar varias cuentas de un perfil). */
  accountName?: string;
  accountTag?: string;
}

/**
 * Desglose del cambio competitivo de una partida. Todos los campos llegan del
 * mmr-history v2 (v4.10) y son `null` en registros antiguos.
 */
export interface RrChangeDetail {
  /** RR antes de la partida. */
  rrBefore: number | null;
  /** RR después (el `rr` del historial). */
  rrAfter: number | null;
  /** Cambio neto de RR (last_change). */
  delta: number | null;
  /** Bono de rendimiento (MVP, marcador alto). */
  bonus: number;
  /** Penalización de RR (dodge/abandono). */
  penalty: number;
  /** Penalización por AFK. */
  afkPenalty: number;
  /** RR devuelto (partida con tramposo, corrección de Riot). */
  refunded: number;
  /** RR perdonado por el incentivo de mapa nuevo. */
  forgiven: number;
  /** Partida de colocación. */
  placement: boolean;
  /** El escudo de protección de rango evitó el descenso. */
  derankProtected: boolean;
  /** Se repuso el escudo con esta partida. */
  shieldReplenished: boolean;
  /** Dirección del movimiento competitivo (MOVEMENT_UP/DOWN). */
  movement: 'up' | 'down' | 'none' | null;
  /** Cola de la partida ("competitive"...) si la API la publica. */
  queue: string | null;
  /** Tier antes de la partida (promoción/descenso). */
  tierBefore: string | null;
  /** true = la entrada trae el detalle nuevo de v4.10. */
  detailed: boolean;
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
  /** Rondas con first blood oficial de Riot (match v4 desde v4.10). */
  fbOfficial?: number;
  /** Rondas con bando oficial (`winning_team_role`), sin necesidad de inferirlo. */
  sideOfficial?: number;
}

/**
 * Cotejo entre el first blood OFICIAL de Riot (`rounds[].first_blood`, v4.10)
 * y el inferido del kill feed. Sirve para auditar el motor de aperturas.
 */
export interface AperturaVerificacion {
  /** Rondas del periodo. */
  rounds: number;
  /** Rondas con dato oficial disponible (el resto son anteriores a v4.10). */
  official: number;
  /** De esas: el killer de Riot coincide con el del kill feed. */
  agree: number;
  /** De esas: discrepan (kill feed incompleto o dato corrupto). */
  mismatch: number;
  /** Rondas con bando oficial (`winning_team_role`). */
  sideOfficial: number;
}

/** Detalle por ronda de FB/FD (solo proveedor Henrik). */
export interface ValAperturas {
  total: AperturaBucket;
  atk: AperturaBucket;
  def: AperturaBucket;
  /** Rondas con bando indeterminado (sin dato oficial ni plantas que lo revelen). */
  sinLado: number;
  byMap: AperturaGrupo[];
  byAgent: AperturaGrupo[];
  /** Más reciente primero. */
  matches: AperturaPartida[];
  /** Auditoría del motor contra el first blood oficial de Riot. */
  verificacion?: AperturaVerificacion;
}

/** Escudos de protección de rango (MMR v3). */
export interface RankProtection {
  /** Escudos disponibles. */
  shields: number;
  /** "Empty" | "Available" | ... tal cual lo publica Riot. */
  status: string | null;
  /** El tier actual está protegido por diseño. */
  atProtectedTier: boolean;
}

/** Estado de rango enriquecido (MMR v3 de Henrik). */
export interface ValRankState {
  tier: { id: number; name: string } | null;
  rr: number | null;
  elo: number | null;
  /** Pico histórico de la cuenta (con la temporada en que se logró). */
  peak: { tier: string | null; rr: number | null; season: string | null } | null;
  protection: RankProtection;
  /** Partidas que faltan para entrar en el rating/leaderboard. */
  gamesNeededForRating: number | null;
  gamesNeededForLeaderboard: number | null;
  leaderboardPlacement: number | null;
  /** Prestigios de por vida por tier, de mayor a menor. */
  prestige: { tier: string; count: number }[];
  /** El jugador ocultó su insignia de rango. */
  rankedBadgeHidden: boolean;
  /** Leaderboard anonimizado. */
  leaderboardAnonymized: boolean;
}

/** Un récord de la cuenta (accolade de Riot). */
export interface RecordMetric {
  /** Tipo de accolade de la API (kills, first_blood...). */
  kind: string;
  /** Etiqueta en español. */
  label: string;
  /** Unidad del valor (kills, ADR, %...). */
  unit: string;
  /** Nº de veces conseguido. */
  count: number;
  /** Mejor valor histórico. */
  best: number;
  /** Mejor valor formateado. */
  bestText: string;
}

/** Récords y accolades de la cuenta (endpoint /valorant/v1/accolades). */
export interface ValRecords {
  allTime: RecordMetric[];
  /** Récords de la temporada en curso (si Riot los publica). */
  season: { season: string | null; metrics: RecordMetric[] } | null;
  /** Partidas recientes con tus accolades (más reciente primero). */
  recent: {
    matchId: string;
    date: string;
    items: { label: string; value: number; valueText: string; actRecord: boolean }[];
  }[];
  /** Récords batidos en las partidas más recientes (is_act_record de Riot). */
  actRecords: { label: string; value: number; valueText: string; matchId: string; date: string }[];
}

/** Maestría de un agente. */
export interface ValMasteryAgent {
  agentId: string;
  agent: string;
  /** Nivel de maestría (track principal). */
  level: number;
  flourishShort: number | null;
  flourishLong: number | null;
  /** Módulos de stats del agente (Riot solo los publica en algunos casos). */
  modules: { label: string; value: number }[];
}

export interface ValMastery {
  /** Agentes con maestría, de mayor a menor nivel. */
  agents: ValMasteryAgent[];
  /** Suma de niveles (amplitud del champ pool). */
  totalLevel: number;
  /** Agentes a nivel máximo (>= 5 tracks o nivel alto). */
  maxed: number;
}

/** Una temporada de Premier del equipo. */
export interface ValPremierSeason {
  id: string;
  name: string | null;
  enrolled: boolean;
  crest: string | null;
  wins: number;
  losses: number;
  matches: number;
  roundsWon: number;
  roundsLost: number;
  winRate: number | null;
  points: number;
  conference: string | null;
  division: number | null;
  provisional: boolean;
  promotionApplied: boolean;
  earnedPromotion: boolean;
  earnedPrestige: boolean;
}

/** Equipo de Premier (roster, resultados y temporadas). */
export interface ValPremier {
  id: string;
  name: string;
  tag: string;
  icon: string | null;
  image: string | null;
  primary: string | null;
  secondary: string | null;
  tertiary: string | null;
  createdAt: string | null;
  members: {
    puuid: string;
    name: string | null;
    tag: string | null;
    /** OWNER | MEMBER | ... tal cual lo publica Riot. */
    role: string;
    joinedAt: string | null;
    /** true = la cuenta está entre los perfiles del dashboard. */
    known: boolean;
  }[];
  current: ValPremierSeason | null;
  seasons: ValPremierSeason[];
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
  byAgent: (GroupStats & { agent: string })[];
  byMap: (GroupStats & { map: string })[];
  matches: MatchRow[];
  /**
   * RR neto por día (`YYYY-MM-DD`) de los snapshots persistidos de /reglas.
   * Cubre los días que ya salieron de la ventana de ~20 del mmr-history.
   */
  savedDayRR?: Record<string, number> | null;
  /** Solo proveedor Henrik: uso de armas derivado del kill feed */
  arsenal?: ValArsenal;
  /** Solo proveedor Henrik: FB/FD por ronda con bando inferido (plantas) */
  aperturas?: ValAperturas;
  /**
   * Estado de rango enriquecido (MMR v3): escudos de protección, pico,
   * prestigio y partidas que faltan para el rating. null si la API no lo dio.
   */
  rank?: ValRankState | null;
}

export interface AgentIconInfo {
  name: string;
  icon: string | null;
  /** Rol del agente (Duelist/Initiator/Controller/Sentinel) */
  role?: string | null;
}
