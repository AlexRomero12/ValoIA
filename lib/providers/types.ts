/**
 * Modelo interno de partida (proveedor-neutral).
 *
 * Es el contrato que consumen agregación, archivo y detalle. En esta rama lo
 * alimenta el proveedor Riot (dev + mock); los tipos reflejan los campos que la
 * API oficial sí expone (sin RR/MMR, sin nivel de cuenta).
 */

export interface MatchPlayerStats {
  score?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  headshots?: number;
  bodyshots?: number;
  legshots?: number;
  damage?: { dealt?: number; received?: number };
}

export interface MatchPlayer {
  puuid?: string;
  name?: string;
  tag?: string;
  team_id?: string;
  agent?: { id?: string; name?: string };
  tier?: { id?: number; name?: string };
  stats?: MatchPlayerStats;
  economy?: {
    spent?: { overall?: number; average?: number };
    loadout_value?: { overall?: number; average?: number };
  };
  behavior?: { afk_rounds?: number };
}

export interface MatchTeam {
  team_id?: string | null;
  rounds?: { won?: number; lost?: number };
  won?: boolean | null;
}

export interface MatchKill {
  killer?: { puuid?: string; name?: string; team?: string };
  victim?: { puuid?: string; name?: string; team?: string };
  assistants?: { name?: string; puuid?: string }[];
  weapon?: { id?: string | null; name?: string | null; type?: string | null };
  round?: number;
}

export interface MatchRound {
  id?: number;
  result?: string;
  winning_team?: string | null;
  plant?: { site?: string; player?: { name?: string; puuid?: string } } | null;
  defuse?: { player?: { name?: string; puuid?: string } } | null;
}

export interface MatchRecord {
  metadata: {
    match_id?: string;
    map?: { id?: string; name?: string };
    started_at?: string;
    game_length_in_ms?: number;
    is_completed?: boolean;
    queue?: { id?: string; mode_type?: string | null; name?: string | null };
    season?: { id?: string; short?: string };
    platform?: string;
    region?: string | null;
    cluster?: string | null;
  };
  players?: MatchPlayer[];
  teams?: MatchTeam[];
  kills?: MatchKill[];
  rounds?: MatchRound[];
}

export function matchIdOf(m: MatchRecord): string {
  return m.metadata?.match_id ?? '';
}

export function matchTimestamp(m: MatchRecord): number {
  const iso = m.metadata?.started_at;
  if (iso) {
    const t = Date.parse(iso);
    if (Number.isFinite(t)) return t;
  }
  return 0;
}

export function matchRoundsPlayed(m: MatchRecord): number {
  const teams = m.teams ?? [];
  // Ambos equipos juegan las mismas rondas: usamos el máximo de un equipo,
  // no la suma de ambos (que duplicaría el total).
  let maxTeam = 0;
  for (const t of teams) {
    maxTeam = Math.max(maxTeam, (t.rounds?.won ?? 0) + (t.rounds?.lost ?? 0));
  }
  return Math.max(1, maxTeam);
}

/**
 * Encuentra al jugador en una partida.
 *
 * Riot usa dos representaciones de PUUID: ACCOUNT-V1 devuelve el PUUID cifrado
 * (78 chars) y los datos de partida usan el UUID clásico; por eso, si el puuid
 * no coincide, se cae a nombre#tag (el mock usa UUIDs del archivo).
 */
export function findMePlayer(
  m: MatchRecord,
  puuid?: string | null,
  name?: string | null,
  tag?: string | null,
): MatchPlayer | undefined {
  const players = m.players ?? [];
  if (puuid) {
    const byPuuid = players.find((p) => p.puuid === puuid);
    if (byPuuid) return byPuuid;
  }
  if (name) {
    const ln = name.trim().toLowerCase();
    const lt = (tag ?? '').trim().toLowerCase();
    return players.find(
      (p) => String(p.name ?? '').toLowerCase() === ln && (!lt || String(p.tag ?? '').toLowerCase() === lt),
    );
  }
  return undefined;
}
