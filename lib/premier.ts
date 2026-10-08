import type { HenrikPremierSeason, HenrikPremierTeam } from './henrik';
import type { ValPremier, ValPremierSeason } from './types';

/**
 * Premier v2 (v4.10): equipo, roster con roles y resultados por temporada.
 *
 * La API devuelve los miembros solo con su `puuid`; los nombres se resuelven
 * aparte (con `/valorant/v2/by-puuid/account/{puuid}` o con los perfiles del
 * dashboard) y se pasan aquí ya resueltos.
 *
 * Ojo con las temporadas sin inscribir: Premier devuelve `enrolled: false` con
 * stats y placement a cero (y `is_provisional: true`), que NO son resultados
 * reales. Se conservan pero marcados, para que la UI no pinte un 0-0 como si
 * fuera una temporada jugada.
 *
 * Módulo puro: sin red ni disco.
 */

const CONFERENCE_LABELS: Record<string, string> = {
  NA: 'Norteamérica',
  EU: 'Europa',
  AP: 'Asia-Pacífico',
  KR: 'Corea',
  BR: 'Brasil',
  LATAM: 'Latinoamérica',
  LATAM_NORTH: 'LATAM Norte',
  LATAM_SOUTH: 'LATAM Sur',
};

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Capitán',
  MEMBER: 'Miembro',
  INVITED: 'Invitado',
  SUBSTITUTE: 'Suplente',
  COACH: 'Entrenador',
};

export function conferenceLabel(conference: string | null | undefined): string | null {
  if (!conference) return null;
  return CONFERENCE_LABELS[conference.toUpperCase()] ?? conference;
}

export function premierRoleLabel(role: string | null | undefined): string {
  if (!role) return 'Miembro';
  return ROLE_LABELS[role.toUpperCase()] ?? role;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function seasonView(s: HenrikPremierSeason | null | undefined): ValPremierSeason | null {
  if (!s || typeof s !== 'object') return null;
  const wins = num(s.stats?.wins);
  const losses = num(s.stats?.losses);
  const matches = num(s.stats?.matches) || wins + losses;
  return {
    id: s.id ?? '',
    name: s.name ?? null,
    enrolled: s.enrolled === true,
    crest: s.crest ?? null,
    wins,
    losses,
    matches,
    roundsWon: num(s.stats?.rounds?.won),
    roundsLost: num(s.stats?.rounds?.lost),
    winRate: matches > 0 ? wins / matches : null,
    points: num(s.placement?.points),
    conference: s.placement?.conference ?? null,
    division: typeof s.placement?.division === 'number' ? s.placement.division : null,
    provisional: s.placement?.is_provisional === true,
    promotionApplied: s.promotion_applied === true,
    earnedPromotion: s.has_earned_promotion_for_next_season === true,
    earnedPrestige: s.has_earned_prestige === true,
  };
}

export interface PremierNameMap {
  /** puuid -> { name, tag } ya resuelto. */
  [puuid: string]: { name: string; tag: string } | undefined;
}

/** Puuids de los perfiles del dashboard (para marcar los miembros conocidos). */
export function premierFrom(
  team: HenrikPremierTeam | null | undefined,
  names: PremierNameMap = {},
  knownPuuds: Iterable<string> = [],
): ValPremier | null {
  if (!team || typeof team !== 'object') return null;
  if (!team.id && !team.name) return null;
  const known = new Set(knownPuuds);
  const current = seasonView(team.current_season);
  const seasons = (team.seasons ?? [])
    .map(seasonView)
    .filter((s): s is ValPremierSeason => s != null)
    .filter((s) => s.enrolled || s.matches > 0)
    .sort((a, b) => b.matches - a.matches || a.id.localeCompare(b.id));

  return {
    id: team.id ?? '',
    name: team.name ?? '?',
    tag: team.tag ?? '',
    icon: team.customization?.icon ?? null,
    image: team.customization?.image ?? null,
    primary: team.customization?.primary ?? null,
    secondary: team.customization?.secondary ?? null,
    tertiary: team.customization?.tertiary ?? null,
    createdAt: team.created_at ?? null,
    members: (team.member ?? []).map((m) => {
      const puuid = m.puuid ?? '';
      const resolved = names[puuid];
      return {
        puuid,
        name: resolved?.name ?? null,
        tag: resolved?.tag ?? null,
        role: m.role?.name ?? 'MEMBER',
        joinedAt: m.joined_at ?? null,
        known: known.has(puuid),
      };
    }),
    current,
    seasons,
  };
}

/** true si la temporada en curso tiene resultados reales que enseñar. */
export function premierSeasonPlayed(s: ValPremierSeason | null | undefined): boolean {
  return Boolean(s && s.enrolled && s.matches > 0);
}
