import { cached, peek } from '../cache';
import { RIOT_CONFIG, RiotApiError, platformHost, riotFetch } from './client';
import { getContent } from './content';
import { mapMatchDto } from './mapper';
import { getMockMatch, getMockMatchlist } from './mock';
import type { MatchRecord } from '../providers/types';
import { matchIdOf, matchTimestamp } from '../providers/types';
import type { RiotMatchDto, RiotMatchlistDto } from './types';

/**
 * Sincronización de partidas (VAL-MATCH-V1).
 *
 * - `RIOT_MATCH_SOURCE=mock` (default en dev): matchlist y matches salen de
 *   `lib/riot/mock` — mismos DTOs que producción.
 * - `RIOT_MATCH_SOURCE=live`: API real (requiere key productiva).
 *
 * El bucket cachea el resultado 15 min y el archivo acumulativo (`lib/archive`)
 * guarda cada partida nueva para siempre.
 */

export const BUCKET_LIMIT = 40;
export const BUCKET_TTL_MS = 15 * 60 * 1000;
const BUCKET_PREFIX = 'riot:matches:v1';

export interface MatchesBucket {
  /** ms epoch de la última sincronización exitosa */
  updatedAt: number;
  /** 'mock' | 'live': origen de los datos (se muestra en la UI) */
  source: 'mock' | 'live';
  /** hasta BUCKET_LIMIT partidas competitivas, más recientes primero */
  matches: MatchRecord[];
}

function bucketKey(nameEncoded: string, tagEncoded: string): string {
  return `${BUCKET_PREFIX}:${nameEncoded}:${tagEncoded}`;
}

/** Key de caché del bucket (compartida con lib/refresh.ts). */
export function matchesBucketKey(name: string, tag: string): string {
  return bucketKey(encodeURIComponent(name), encodeURIComponent(tag));
}

async function fetchMatchlist(puuid: string): Promise<RiotMatchlistDto> {
  if (RIOT_CONFIG.matchSource() === 'mock') return getMockMatchlist();
  return riotFetch<RiotMatchlistDto>(`${platformHost()}/val/match/v1/matchlists/by-puuid/${puuid}`);
}

async function fetchMatch(matchId: string): Promise<RiotMatchDto> {
  if (RIOT_CONFIG.matchSource() === 'mock') {
    const mock = getMockMatch(matchId);
    if (!mock) throw new RiotApiError('NOT_FOUND', `El fixture no contiene la partida ${matchId}`, 404);
    return mock;
  }
  return riotFetch<RiotMatchDto>(`${platformHost()}/val/match/v1/matches/${matchId}`);
}

/**
 * Descarga las partidas de la ventana pedida, las mapea al modelo interno y
 * archiva las nuevas. Coste: 1 (matchlist) + N (matches) por ciclo; el caché
 * del bucket y el archivo evitan repetir trabajo.
 */
export async function syncMatches(
  nameArg: string,
  tagArg: string,
  puuid: string,
  want: number,
  mode = 'competitive',
): Promise<MatchesBucket> {
  const target = Math.max(1, Math.min(want, BUCKET_LIMIT));
  const source = RIOT_CONFIG.matchSource();
  const dicts = await getContent();

  const list = await fetchMatchlist(puuid);
  const entries = [...(list.history ?? [])]
    .sort((a, b) => (b.gameStartTimeMillis ?? 0) - (a.gameStartTimeMillis ?? 0))
    .slice(0, target);

  const base = peek<MatchesBucket>(bucketKey(encodeURIComponent(nameArg), encodeURIComponent(tagArg)));
  const known = new Set((base?.matches ?? []).map(matchIdOf));

  const fetched: MatchRecord[] = [];
  const CHUNK = 5;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    const settled = await Promise.all(
      chunk.map(async (entry) => {
        try {
          const dto = await fetchMatch(entry.matchId);
          // El matchlist puede traer colas distintas (no filtra por modo);
          // se descartan las que no son del modo pedido.
          const queue = (dto.matchInfo?.queueID ?? '').toLowerCase();
          if (mode && queue && queue !== mode) return null;
          return mapMatchDto(dto, dicts);
        } catch (err) {
          if (err instanceof RiotApiError && (err.code === 'FORBIDDEN' || err.code === 'KEY_MISSING')) throw err;
          return null;
        }
      }),
    );
    for (const m of settled) {
      if (!m) continue;
      const id = matchIdOf(m);
      if (!id) continue;
      fetched.push(m);
    }
  }

  const byId = new Map<string, MatchRecord>();
  for (const m of [...fetched, ...(base?.matches ?? [])]) {
    const id = matchIdOf(m);
    if (id && !byId.has(id)) byId.set(id, m);
  }
  const all = [...byId.values()]
    .sort((a, b) => matchTimestamp(b) - matchTimestamp(a))
    .slice(0, BUCKET_LIMIT);

  // Archivo acumulativo: toda partida nueva se guarda para siempre.
  const fresh = fetched.filter((m) => !known.has(matchIdOf(m)));
  if (fresh.length) {
    try {
      const { mergeIntoArchive } = await import('../archive');
      mergeIntoArchive(nameArg, tagArg, fresh);
    } catch (err) {
      console.error(`[archive] no se pudo archivar ${nameArg}#${tagArg}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { updatedAt: Date.now(), source, matches: all };
}

/** Bucket de partidas: caché 15 min con validador de cobertura. */
export async function getMatchesBucket(nameArg: string, tagArg: string, puuid: string, want: number): Promise<MatchesBucket> {
  const key = bucketKey(encodeURIComponent(nameArg), encodeURIComponent(tagArg));
  return cached(
    key,
    BUCKET_TTL_MS,
    () => syncMatches(nameArg, tagArg, puuid, want),
    (v) => Array.isArray((v as MatchesBucket)?.matches) && (v as MatchesBucket).matches.length >= want,
  );
}

/** Partidas cacheadas del bucket (para el detalle de partida), sin red. */
export function getCachedMatches(nameArg: string, tagArg: string): MatchRecord[] {
  const hit = peek<MatchesBucket>(bucketKey(encodeURIComponent(nameArg), encodeURIComponent(tagArg)));
  return hit?.matches ?? [];
}
