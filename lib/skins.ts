import { cached } from './cache';

/**
 * Catálogo de skins (uuid -> nombre/icono/arma) desde valorant-api.com.
 *
 * El storefront de Riot devuelve UUIDs (OfferID de skinlevels), no nombres.
 * Este módulo descarga el catálogo completo de skinlevels y armas, construye
 * un índice por uuid y lo cachea 7 días (solo cambia con parches del juego).
 * El cache se re-descarga solo si se borra; las favoritas NO dependen de él
 * (guardan su propio snapshot en lib/favorites.ts).
 */

export interface SkinInfo {
  id: string;
  name: string;
  icon: string;
  weapon: string;
}

interface SkinlevelEntry {
  uuid?: string;
  displayName?: string;
  displayIcon?: string | null;
  weaponUuid?: string;
  chromaUuid?: string | null;
}

interface WeaponEntry {
  uuid?: string;
  displayName?: string;
  displayIcon?: string | null;
  category?: string;
  shopData?: { category?: string };
  skins?: Array<{
    displayName?: string;
    levels?: Array<{ uuid?: string }>;
    chromas?: Array<{ uuid?: string; displayName?: string; displayIcon?: string | null }>;
  }>;
}

const CATALOG_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CATALOG_KEY = 'valo:skins-catalog';

/** Orden de categorías del juego (in-game). */
const CATEGORY_ORDER = ['Sidearms', 'SMGs', 'Shotguns', 'Rifles', 'Snipers', 'Machine Guns', 'Melee'];

/** valorant-api usa nombres internos: se normalizan a los del juego. */
const CATEGORY_MAP: Record<string, string> = {
  Pistols: 'Sidearms',
  'Sniper Rifles': 'Snipers',
  'Heavy Weapons': 'Machine Guns',
  'EEquippableCategory::Melee': 'Melee',
};

/** Skins base vendibles: sin niveles de evolución ni variantes/chromas. */
function isBaseSkin(name: string): boolean {
  return !/Level \d|\(/i.test(name);
}

export interface WeaponGroup {
  name: string;
  category: string;
  icon: string;
  /** skins base de la arma (sin niveles de evolución ni variantes) */
  skins: SkinInfo[];
}

/** Variante de color (chroma) de una skin. */
export interface ChromaInfo {
  id: string;
  name: string;
  icon: string;
  /** etiqueta corta: Estándar / Variant 1 Orange / White… */
  label: string;
}

export interface SkinsCatalog {
  /** uuid del skinlevel -> SkinInfo */
  byId: Map<string, SkinInfo>;
  /** lista plana para búsqueda */
  list: SkinInfo[];
  /** armas con categoría e icono, para navegar el arsenal */
  weapons: WeaponGroup[];
  /** uuid (nivel o chroma) -> variantes de su skin */
  chromasByLevelId: Map<string, ChromaInfo[]>;
}

async function fetchCatalogRaw(): Promise<SkinsCatalog> {
  const [levelsRes, weaponsRes] = await Promise.all([
    fetch('https://valorant-api.com/v1/weapons/skinlevels', { signal: AbortSignal.timeout(30_000) }),
    fetch('https://valorant-api.com/v1/weapons', { signal: AbortSignal.timeout(30_000) }),
  ]);
  if (!levelsRes.ok || !weaponsRes.ok) {
    throw new Error(`catálogo de skins HTTP ${levelsRes.status}/${weaponsRes.status}`);
  }
  const levels = (await levelsRes.json()) as { data?: SkinlevelEntry[] };
  const weapons = (await weaponsRes.json()) as { data?: WeaponEntry[] };

  // skinlevels NO trae weaponUuid: el arma se resuelve recorriendo los
  // niveles y chromas de /v1/weapons (uuid -> nombre de arma).
  const weaponByUuid = new Map<string, string>();
  for (const w of weapons.data ?? []) {
    for (const s of w.skins ?? []) {
      for (const l of s.levels ?? []) {
        if (l.uuid) weaponByUuid.set(l.uuid, w.displayName ?? '');
      }
      for (const c of s.chromas ?? []) {
        if (c.uuid) weaponByUuid.set(c.uuid, w.displayName ?? '');
      }
    }
  }

  const byId = new Map<string, SkinInfo>();
  const byName = new Map<string, string>();
  const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
  for (const l of levels.data ?? []) {
    if (!l.uuid || !l.displayName) continue;
    const name = clean(l.displayName);
    byId.set(l.uuid, {
      id: l.uuid,
      name,
      icon: l.displayIcon ?? '',
      weapon: weaponByUuid.get(l.uuid) ?? '',
    });
    byName.set(name.toLowerCase(), l.uuid);
  }
  // Los chromas (variantes de color) NO son skinlevels, pero sí se venden
  // (sobre todo en bundles): se añaden con su propio uuid para que los
  // ItemID del bundle se resuelvan a nombre/icono. El chroma estándar duplica
  // el nombre del skinlevel base -> se descarta (manda el skinlevel).
  for (const w of weapons.data ?? []) {
    for (const s of w.skins ?? []) {
      for (const c of s.chromas ?? []) {
        if (!c.uuid || !c.displayName || byId.has(c.uuid)) continue;
        const name = clean(c.displayName);
        if (byName.has(name.toLowerCase())) continue;
        byName.set(name.toLowerCase(), c.uuid);
        byId.set(c.uuid, {
          id: c.uuid,
          name,
          icon: c.displayIcon ?? '',
          weapon: w.displayName ?? '',
        });
      }
    }
  }

  // Grupos por arma (para navegar el arsenal): solo skins base vendibles.
  const weaponGroups = new Map<string, WeaponGroup>();
  for (const w of weapons.data ?? []) {
    const name = w.displayName ?? '';
    if (!name) continue;
    const rawCat = w.shopData?.category ?? w.category ?? '';
    weaponGroups.set(name, {
      name,
      category: CATEGORY_MAP[rawCat] ?? rawCat,
      icon: w.displayIcon ?? '',
      skins: [],
    });
  }
  for (const s of byId.values()) {
    const group = s.weapon ? weaponGroups.get(s.weapon) : undefined;
    if (group && isBaseSkin(s.name)) group.skins.push(s);
  }

  // Índice de variantes (chromas) por uuid de nivel/chroma: al previsualizar
  // una skin se pueden ver todas sus variantes de color.
  const chromasByLevelId = new Map<string, ChromaInfo[]>();
  const labelFor = (name: string, idx: number): string => {
    const m = name.match(/\(([^)]+)\)\s*$/);
    if (m) return m[1];
    return idx === 0 ? 'Estándar' : name;
  };
  for (const w of weapons.data ?? []) {
    for (const s of w.skins ?? []) {
      const chromas: ChromaInfo[] = [];
      (s.chromas ?? []).forEach((c, idx) => {
        if (!c.uuid) return;
        chromas.push({
          id: c.uuid,
          name: clean(c.displayName ?? ''),
          icon: c.displayIcon ?? '',
          label: labelFor(clean(c.displayName ?? ''), idx),
        });
      });
      if (chromas.length < 2) continue;
      const ids = [
        ...(s.levels ?? []).map((l) => l.uuid),
        ...chromas.map((c) => c.id),
      ];
      for (const id of ids) {
        if (id) chromasByLevelId.set(id, chromas);
      }
    }
  }

  const weaponGroupsList: WeaponGroup[] = [...weaponGroups.values()].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.name.localeCompare(b.name),
  );

  return { byId, list: [...byId.values()], weapons: weaponGroupsList, chromasByLevelId };
}

export async function getSkinsCatalog(): Promise<SkinsCatalog> {
  return cached(CATALOG_KEY, CATALOG_TTL_MS, fetchCatalogRaw, (v) => {
    const cat = v as SkinsCatalog;
    return (
      cat?.byId instanceof Map &&
      cat.byId.size > 1000 &&
      Array.isArray(cat.weapons) &&
      cat.weapons.length > 0 &&
      cat.chromasByLevelId instanceof Map
    );
  });
}

/** Resuelve un uuid de skinlevel (null si el catálogo aún no lo conoce). */
export async function getSkinById(id: string): Promise<SkinInfo | null> {
  const cat = await getSkinsCatalog();
  return cat.byId.get(id) ?? null;
}

/** Armas agrupadas (para el explorador). */
export async function getWeaponGroups(): Promise<WeaponGroup[]> {
  const cat = await getSkinsCatalog();
  return cat.weapons;
}

/** Todas las skins base de una arma concreta. */
export async function getSkinsByWeapon(weaponName: string): Promise<SkinInfo[]> {
  const cat = await getSkinsCatalog();
  const group = cat.weapons.find((w) => w.name.toLowerCase() === weaponName.toLowerCase());
  return group?.skins ?? [];
}

/** Variantes (chromas) de la skin a la que pertenece un uuid. */
export async function getSkinsChromas(id: string): Promise<ChromaInfo[]> {
  const cat = await getSkinsCatalog();
  return cat.chromasByLevelId.get(id) ?? [];
}

/** Búsqueda por nombre (case-insensitive, prefijo primero, luego substring). */
export async function searchSkins(query: string, limit = 12): Promise<SkinInfo[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const cat = await getSkinsCatalog();
  const starts: SkinInfo[] = [];
  const includes: SkinInfo[] = [];
  for (const s of cat.list) {
    // Niveles de evolución y variantes no se venden solos en la tienda diaria.
    if (!isBaseSkin(s.name)) continue;
    const name = s.name.toLowerCase();
    if (name.startsWith(q)) starts.push(s);
    else if (name.includes(q)) includes.push(s);
    if (starts.length >= limit && includes.length >= limit) break;
  }
  return [...starts, ...includes].slice(0, limit);
}