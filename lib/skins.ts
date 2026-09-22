import { cached } from './cache';

/**
 * Catálogo de skins (uuid -> nombre/icono/arma) desde valorant-api.com.
 *
 * El storefront de Riot devuelve UUIDs (OfferID de skinlevels), no nombres.
 * Este módulo descarga el catálogo completo de skinlevels y armas, construye
 * un índice por uuid y lo cachea 7 días (solo cambia con parches del juego).
 * El cache se re-descarga solo si se borra; las favoritas NO dependen de él
 * (guardan su propio snapshot en lib/favorites.ts).
 *
 * Además de nombre/icono/arma, cada skin lleva rareza (contenttiers), colección
 * (themes) y los conteos de niveles/variantes. Los niveles y variantes traen su
 * `streamedVideo` (CDN de Riot) para previsualizar cómo se ven en partida sin
 * descargar nada: el navegador lo reproduce directo desde valorant.dyn.riotcdn.net.
 *
 * Nota de serialización: los índices son `Record` (no `Map`) a propósito — la
 * capa L2 de `cached()` guarda con JSON.stringify y un Map se serializaría a
 * `{}`, dejando la caché en disco inservible.
 */

export interface SkinInfo {
  id: string;
  name: string;
  icon: string;
  weapon: string;
  /** Rareza de la skin (Select/Deluxe/Exclusive/Premium/Ultra), null si es default */
  rarity?: string | null;
  /** Color de la rareza (hex de valorant-api.com), para pintar el chip */
  rarityColor?: string | null;
  /** Colección/tema al que pertenece la skin (p. ej. Reaver) */
  collection?: string | null;
  /** Nº de niveles de evolución (incluye el base). */
  levelCount?: number;
  /** Nº de variantes de color además del estándar (chromas - 1). */
  variantCount?: number;
}

export interface SkinlevelEntry {
  uuid?: string;
  displayName?: string;
  displayIcon?: string | null;
  streamedVideo?: string | null;
}

export interface WeaponSkinLevel {
  uuid?: string;
  displayName?: string;
  displayIcon?: string | null;
  streamedVideo?: string | null;
}

export interface WeaponSkinChroma {
  uuid?: string;
  displayName?: string;
  displayIcon?: string | null;
  fullRender?: string | null;
  streamedVideo?: string | null;
}

export interface WeaponSkin {
  displayName?: string;
  /** uuid de la rareza (contentTier) y del tema/colección de la skin */
  contentTierUuid?: string | null;
  themeUuid?: string | null;
  levels?: WeaponSkinLevel[];
  chromas?: WeaponSkinChroma[];
}

export interface WeaponEntry {
  uuid?: string;
  displayName?: string;
  displayIcon?: string | null;
  category?: string;
  shopData?: { category?: string };
  skins?: WeaponSkin[];
}

export interface ContentTierEntry {
  uuid?: string;
  devName?: string;
  displayName?: string;
  highlightColor?: string | null;
}

export interface ThemeEntry {
  uuid?: string;
  displayName?: string;
}

const CATALOG_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// v4: vídeos ingame (streamedVideo) + fullRender de chromas + conteos de
// niveles/variantes, e índices como Record para que la caché en disco funcione.
const CATALOG_KEY = 'valo:skins-catalog:v4';

/** Normaliza el highlightColor de la API (hex de 6-8 dígitos) a `#rrggbb`. */
function hexColor(raw?: string | null): string | null {
  if (!raw) return null;
  const clean = raw.replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6,8}$/.test(clean)) return null;
  return `#${clean.slice(0, 6)}`;
}

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
  /** render completo (mejor que displayIcon para previsualizar) */
  fullRender?: string | null;
  /** vídeo ingame de la variante (CDN de Riot), null si no tiene */
  video?: string | null;
}

/** Nivel de evolución de una skin (Base, Nivel 2, Nivel 3…). */
export interface SkinLevelInfo {
  id: string;
  label: string;
  icon: string;
  /** vídeo ingame del nivel (CDN de Riot), null si no tiene */
  video?: string | null;
}

/** Niveles y variantes de una skin, indexados por uuid de cualquiera de ellos. */
export interface SkinVariants {
  /** Nombre base de la skin (sin sufijo "Level N") */
  baseName: string;
  levels: SkinLevelInfo[];
  chromas: ChromaInfo[];
}

export interface SkinsCatalog {
  /** uuid del skinlevel (o chroma) -> SkinInfo */
  byId: Record<string, SkinInfo>;
  /** lista plana para búsqueda */
  list: SkinInfo[];
  /** armas con categoría e icono, para navegar el arsenal */
  weapons: WeaponGroup[];
  /** uuid (nivel o chroma) -> niveles y variantes de su skin */
  variantsBySkinId: Record<string, SkinVariants>;
}

/**
 * Construye el catálogo a partir de las respuestas crudas de valorant-api.com.
 * Pura (sin red) para poder testearla con fixtures.
 */
export function buildCatalog(
  levelsData: SkinlevelEntry[],
  weaponsData: WeaponEntry[],
  tiersData: ContentTierEntry[],
  themesData: ThemeEntry[],
): SkinsCatalog {
  const tierById: Record<string, ContentTierEntry> = {};
  for (const t of tiersData) if (t.uuid) tierById[t.uuid.toLowerCase()] = t;
  const themeById: Record<string, string> = {};
  for (const t of themesData) if (t.uuid) themeById[t.uuid.toLowerCase()] = t.displayName ?? '';

  // skinlevels NO trae weaponUuid: el arma se resuelve recorriendo los
  // niveles y chromas de /v1/weapons (uuid -> nombre de arma). En el mismo
  // recorrido se indexa la rareza (contentTier), la colección (theme) y los
  // conteos de niveles/variantes por uuid.
  type SkinMeta = Pick<SkinInfo, 'rarity' | 'rarityColor' | 'collection' | 'levelCount' | 'variantCount'>;
  const weaponByUuid: Record<string, string> = {};
  const metaByUuid: Record<string, SkinMeta> = {};
  for (const w of weaponsData) {
    for (const s of w.skins ?? []) {
      const tier = s.contentTierUuid ? tierById[s.contentTierUuid.toLowerCase()] : undefined;
      const meta: SkinMeta = {
        // devName es el nombre corto que usa el juego (Select/Deluxe/Premium…);
        // displayName ("Premium Edition") es más largo para el chip de la rejilla.
        rarity: tier?.devName ?? tier?.displayName ?? null,
        rarityColor: hexColor(tier?.highlightColor),
        collection: s.themeUuid ? themeById[s.themeUuid.toLowerCase()] ?? null : null,
        levelCount: (s.levels ?? []).length,
        variantCount: Math.max(0, (s.chromas ?? []).length - 1),
      };
      for (const l of s.levels ?? []) {
        if (!l.uuid) continue;
        weaponByUuid[l.uuid] = w.displayName ?? '';
        metaByUuid[l.uuid.toLowerCase()] = meta;
      }
      for (const c of s.chromas ?? []) {
        if (!c.uuid) continue;
        weaponByUuid[c.uuid] = w.displayName ?? '';
        metaByUuid[c.uuid.toLowerCase()] = meta;
      }
    }
  }

  const byId: Record<string, SkinInfo> = {};
  const byName: Record<string, string> = {};
  const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
  for (const l of levelsData) {
    if (!l.uuid || !l.displayName) continue;
    const name = clean(l.displayName);
    byId[l.uuid] = {
      id: l.uuid,
      name,
      icon: l.displayIcon ?? '',
      weapon: weaponByUuid[l.uuid] ?? '',
      ...(metaByUuid[l.uuid.toLowerCase()] ?? {}),
    };
    byName[name.toLowerCase()] = l.uuid;
  }
  // Los chromas (variantes de color) NO son skinlevels, pero sí se venden
  // (sobre todo en bundles): se añaden con su propio uuid para que los
  // ItemID del bundle se resuelvan a nombre/icono. El chroma estándar duplica
  // el nombre del skinlevel base -> se descarta (manda el skinlevel).
  for (const w of weaponsData) {
    for (const s of w.skins ?? []) {
      for (const c of s.chromas ?? []) {
        if (!c.uuid || !c.displayName || byId[c.uuid]) continue;
        const name = clean(c.displayName);
        if (byName[name.toLowerCase()]) continue;
        byName[name.toLowerCase()] = c.uuid;
        byId[c.uuid] = {
          id: c.uuid,
          name,
          // fullRender es el render completo del chroma (mejor que el icono).
          icon: c.fullRender ?? c.displayIcon ?? '',
          weapon: w.displayName ?? '',
          ...(metaByUuid[c.uuid.toLowerCase()] ?? {}),
        };
      }
    }
  }

  // Grupos por arma (para navegar el arsenal): solo skins base vendibles.
  const weaponGroups: Record<string, WeaponGroup> = {};
  for (const w of weaponsData) {
    const name = w.displayName ?? '';
    if (!name) continue;
    const rawCat = w.shopData?.category ?? w.category ?? '';
    weaponGroups[name] = {
      name,
      category: CATEGORY_MAP[rawCat] ?? rawCat,
      icon: w.displayIcon ?? '',
      skins: [],
    };
  }
  for (const s of Object.values(byId)) {
    const group = s.weapon ? weaponGroups[s.weapon] : undefined;
    if (group && isBaseSkin(s.name)) group.skins.push(s);
  }

  // Índice de niveles y variantes por uuid (de cualquier nivel o chroma):
  // al previsualizar una skin se ven sus niveles de evolución, sus colores y
  // el vídeo ingame de cada uno (si lo tiene).
  const variantsBySkinId: Record<string, SkinVariants> = {};
  const labelFor = (name: string, idx: number): string => {
    const m = name.match(/\(([^)]+)\)\s*$/);
    if (m) return m[1];
    return idx === 0 ? 'Estándar' : name;
  };
  for (const w of weaponsData) {
    for (const s of w.skins ?? []) {
      const levels: SkinLevelInfo[] = [];
      (s.levels ?? []).forEach((l, idx) => {
        if (!l.uuid) return;
        const raw = clean(l.displayName ?? '');
        const m = raw.match(/Level (\d+)/i);
        levels.push({
          id: l.uuid,
          label: idx === 0 ? 'Base' : m ? `Nivel ${m[1]}` : `Nivel ${idx + 1}`,
          icon: l.displayIcon ?? '',
          video: l.streamedVideo ?? null,
        });
      });
      const chromas: ChromaInfo[] = [];
      (s.chromas ?? []).forEach((c, idx) => {
        if (!c.uuid) return;
        const render = c.fullRender ?? c.displayIcon ?? '';
        chromas.push({
          id: c.uuid,
          name: clean(c.displayName ?? ''),
          icon: render,
          fullRender: render,
          label: labelFor(clean(c.displayName ?? ''), idx),
          video: c.streamedVideo ?? null,
        });
      });
      if (!levels.length && !chromas.length) continue;
      const variants: SkinVariants = { baseName: clean(s.displayName ?? ''), levels, chromas };
      for (const id of [...levels.map((l) => l.id), ...chromas.map((c) => c.id)]) {
        variantsBySkinId[id] = variants;
      }
    }
  }

  const weaponGroupsList: WeaponGroup[] = Object.values(weaponGroups).sort(
    (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.name.localeCompare(b.name),
  );

  return { byId, list: Object.values(byId), weapons: weaponGroupsList, variantsBySkinId };
}

async function fetchCatalogRaw(): Promise<SkinsCatalog> {
  const [levelsRes, weaponsRes, tiersRes, themesRes] = await Promise.all([
    fetch('https://valorant-api.com/v1/weapons/skinlevels', { signal: AbortSignal.timeout(30_000) }),
    fetch('https://valorant-api.com/v1/weapons', { signal: AbortSignal.timeout(30_000) }),
    // Rareza y colección son enriquecimiento: si fallan, el catálogo sigue.
    fetch('https://valorant-api.com/v1/contenttiers', { signal: AbortSignal.timeout(15_000) }).catch(() => null),
    fetch('https://valorant-api.com/v1/themes', { signal: AbortSignal.timeout(15_000) }).catch(() => null),
  ]);
  if (!levelsRes.ok || !weaponsRes.ok) {
    throw new Error(`catálogo de skins HTTP ${levelsRes.status}/${weaponsRes.status}`);
  }
  const levels = ((await levelsRes.json()) as { data?: SkinlevelEntry[] }).data ?? [];
  const weapons = ((await weaponsRes.json()) as { data?: WeaponEntry[] }).data ?? [];
  const tiers = tiersRes?.ok ? ((await tiersRes.json()) as { data?: ContentTierEntry[] }).data ?? [] : [];
  const themes = themesRes?.ok ? ((await themesRes.json()) as { data?: ThemeEntry[] }).data ?? [] : [];
  return buildCatalog(levels, weapons, tiers, themes);
}

export async function getSkinsCatalog(): Promise<SkinsCatalog> {
  return cached(CATALOG_KEY, CATALOG_TTL_MS, fetchCatalogRaw, (v) => {
    const cat = v as SkinsCatalog;
    return (
      !!cat?.byId &&
      Object.keys(cat.byId).length > 1000 &&
      Array.isArray(cat.weapons) &&
      cat.weapons.length > 0 &&
      !!cat.variantsBySkinId
    );
  });
}

/** Resuelve un uuid de skinlevel (o chroma) a su info (null si no lo conoce). */
export async function getSkinById(id: string): Promise<SkinInfo | null> {
  const cat = await getSkinsCatalog();
  return cat.byId[id] ?? null;
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

/** Niveles y variantes (chromas) de la skin a la que pertenece un uuid. */
export async function getSkinVariants(id: string): Promise<SkinVariants | null> {
  const cat = await getSkinsCatalog();
  return cat.variantsBySkinId[id] ?? null;
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
