import { cached } from '../cache';
import { platformHost, riotFetch } from './client';
import type { RiotContentDto } from './types';

/**
 * Catálogo de contenido.
 *
 * - Nombres de agentes/mapas: VAL-CONTENT-V1 (oficial, dev OK).
 * - Iconos, roles y armas: valorant-api.com (solo assets; Riot no sirve URLs
 *   de imagen desde su API pública).
 * - Sin temporadas: los acts de VAL-CONTENT-V1 no traen fechas, así que el
 *   concepto de "temporada" no existe en esta rama.
 */

export interface ContentEntry {
  name: string;
  icon: string | null;
  /** Rol del agente (Duelist/Initiator/Controller/Sentinel) — solo agentes */
  role?: string | null;
}

export interface ContentDicts {
  /** key: uuid del agente (lowercase) */
  agents: Record<string, ContentEntry>;
  /** key: mapUrl / path del mapa (lowercase) */
  maps: Record<string, ContentEntry>;
  /** key: nombre del arma (lowercase) */
  weapons: Record<string, ContentEntry & { category: string | null }>;
  /** key: uuid del arma (lowercase) */
  weaponsById: Record<string, ContentEntry & { category: string | null }>;
}

const EMPTY: ContentDicts = { agents: {}, maps: {}, weapons: {}, weaponsById: {} };

let contentPromise: Promise<ContentDicts> | null = null;

async function loadRiotContent(): Promise<RiotContentDto | null> {
  try {
    return await riotFetch<RiotContentDto>(`${platformHost()}/val/content/v1/contents?locale=es-MX`);
  } catch {
    // Sin key o sin permiso: los nombres caen al catálogo de valorant-api.com.
    return null;
  }
}

async function loadContent(): Promise<ContentDicts> {
  try {
    const [riot, agentsRes, mapsRes, weaponsRes] = await Promise.all([
      loadRiotContent(),
      fetch('https://valorant-api.com/v1/agents?isPlayableCharacter=true', { signal: AbortSignal.timeout(15_000) }),
      fetch('https://valorant-api.com/v1/maps', { signal: AbortSignal.timeout(15_000) }),
      fetch('https://valorant-api.com/v1/weapons', { signal: AbortSignal.timeout(15_000) }),
    ]);
    const agents = agentsRes.ok
      ? ((await agentsRes.json()) as {
          data?: { uuid?: string; displayName?: string; killfeedPortrait?: string | null; displayIcon?: string | null; role?: { displayName?: string } | null }[];
        })
      : null;
    const maps = mapsRes.ok
      ? ((await mapsRes.json()) as { data?: { uuid?: string; displayName?: string; mapUrl?: string; displayIcon?: string | null }[] })
      : null;
    const weapons = weaponsRes.ok
      ? ((await weaponsRes.json()) as { data?: { uuid?: string; displayName?: string; displayIcon?: string | null; category?: string }[] })
      : null;

    const dict: ContentDicts = { agents: {}, maps: {}, weapons: {}, weaponsById: {} };
    // El content oficial manda para los nombres (localizados); valorant-api
    // aporta el icono y el rol.
    const riotAgentName = new Map<string, string>();
    for (const c of riot?.characters ?? []) {
      if (c.id && c.name) riotAgentName.set(c.id.toLowerCase(), c.name);
    }
    for (const a of agents?.data ?? []) {
      if (a.uuid && a.displayName) {
        const key = a.uuid.toLowerCase();
        dict.agents[key] = {
          name: riotAgentName.get(key) ?? a.displayName,
          // killfeedPortrait pesa ~24 KB frente a ~555 KB del displayIcon y se
          // usa a 18–40 px en todo el dash (matches, paneles, pickers, detalle).
          icon: a.killfeedPortrait ?? a.displayIcon ?? null,
          role: a.role?.displayName ?? null,
        };
      }
    }
    // Si el content oficial trae agentes que valorant-api aún no conoce, se
    // agregan sin icono (mejor nombre sin imagen que UUID crudo).
    for (const [uuid, name] of riotAgentName) {
      if (!dict.agents[uuid]) dict.agents[uuid] = { name, icon: null, role: null };
    }
    for (const m of maps?.data ?? []) {
      if (m.mapUrl && m.displayName) {
        const entry = {
          name: m.displayName.replace(/^[^_]*_/, '').replace(/_/g, ' '),
          icon: m.displayIcon ?? null,
        };
        // Producción usa el path (`/Game/Maps/...`); el archivo/Fixtures usan
        // el UUID del mapa. Se indexan ambos para que el nombre resuelva igual.
        dict.maps[m.mapUrl.toLowerCase()] = entry;
        if (m.uuid) dict.maps[m.uuid.toLowerCase()] = entry;
      }
    }
    for (const w of weapons?.data ?? []) {
      if (w.displayName) {
        const category = typeof w.category === 'string' ? (w.category.split('::').pop() ?? null) : null;
        const entry = { name: w.displayName, icon: w.displayIcon ?? null, category };
        dict.weapons[w.displayName.toLowerCase()] = entry;
        if (w.uuid) dict.weaponsById[w.uuid.toLowerCase()] = { ...entry };
      }
    }
    return dict;
  } catch {
    return EMPTY;
  }
}

export function getContent(): Promise<ContentDicts> {
  // v1: catálogo de la rama Riot (nombres oficiales + iconos externos).
  if (!contentPromise) contentPromise = cached('riot:content:v1', 24 * 60 * 60 * 1000, loadContent);
  return contentPromise;
}

/** Nombre de mapa legible desde el mapId/path del match (fallback heurístico). */
export function mapDisplayName(mapId: string | undefined, dicts: ContentDicts): string {
  if (!mapId) return '?';
  const known = dicts.maps[mapId.toLowerCase()];
  if (known) return known.name;
  const tail = mapId.split('/').pop() ?? mapId;
  const cleaned = tail.replace(/^.*?_/, '').replace(/_/g, ' ');
  for (const name of ['Ascent', 'Bind', 'Breeze', 'Corrode', 'Fracture', 'Haven', 'Icebox', 'Lotus', 'Pearl', 'Split', 'Sunset', 'Abyss']) {
    if (cleaned.toLowerCase().includes(name.toLowerCase())) return name;
  }
  return cleaned || mapId;
}
