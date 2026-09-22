import { cached } from './cache';
import { getSkinById, type SkinInfo } from './skins';

/**
 * Catálogo de accesorios (cards, buddies, sprays, titles) y arte de bundles
 * desde valorant-api.com, para enriquecer los ítems del bundle de la tienda.
 *
 * El storefront de Riot entrega `{ ItemTypeID, ItemID }`; los ItemID de estos
 * accesorios son uuids de valorant-api (el del padre o el de su level). Este
 * módulo indexa ambos y resuelve nombre/icono/preview sin tocar Riot.
 *
 * Igual que los vídeos de skins, las imágenes y el GIF animado de los sprays se
 * consumen directo del CDN (`media.valorant-api.com`): no se guarda nada.
 *
 * Serialización: los índices son `Record` (no `Map`) para que la caché L2 en
 * disco de `cached()` funcione (un Map se serializaría a `{}`).
 */

/** ItemTypeID de Riot (storefront / entitlements). */
export const ITEM_TYPES = {
  agents: '01bb38e1-da47-4e6a-9b3d-945fe4655707',
  contracts: 'f85cb6f7-33e5-4dc8-b609-ec7212301948',
  sprays: 'd5f120f8-ff8c-4aac-92ea-f2b5acbe9475',
  buddies: 'dd3bf334-87f3-40bd-b043-682a57a8dc3a',
  cards: '3f296c07-64c3-494c-923b-fe692a4fa1bd',
  skins: 'e7c63390-eda7-46e0-bb7a-a6abdacd2433',
  skinVariants: '3ad1b2b2-acdb-4524-852f-954a76ddae0a',
  titles: 'de7caa6b-adf7-4588-bbd1-143831e786c6',
} as const;

export interface CardItem {
  id: string;
  name: string;
  /** avatar cuadrado */
  icon: string;
  smallArt: string;
  wideArt: string;
  /** banner completo (cómo se ve en la pantalla de carga) */
  largeArt: string;
}

export interface BuddyLevel {
  id: string;
  name: string;
  icon: string;
  level: number;
}

export interface BuddyItem {
  id: string;
  name: string;
  /** render del charm */
  icon: string;
  levels: BuddyLevel[];
}

export interface SprayItem {
  id: string;
  name: string;
  icon: string;
  /** versión grande del spray */
  fullIcon: string;
  /** animación real del spray (APNG/GIF), null si es estático */
  animationPng: string | null;
  animationGif: string | null;
}

export interface TitleItem {
  id: string;
  name: string;
  /** texto que se muestra bajo el nombre en partida */
  titleText: string;
}

export interface BundleArt {
  id: string;
  name: string;
  subName: string | null;
  description: string | null;
  /** imagen vertical de promoción del bundle */
  promoImage: string | null;
  icon: string | null;
}

export interface ItemsCatalog {
  cards: Record<string, CardItem>;
  buddies: Record<string, BuddyItem>;
  sprays: Record<string, SprayItem>;
  titles: Record<string, TitleItem>;
  bundles: Record<string, BundleArt>;
}

/** Ítem resuelto de un bundle: skin (con niveles/variantes) o accesorio. */
export type StoreItem =
  | ({ kind: 'skin' } & SkinInfo)
  | ({ kind: 'card' } & CardItem)
  | ({ kind: 'buddy' } & BuddyItem)
  | ({ kind: 'spray' } & SprayItem)
  | ({ kind: 'title' } & TitleItem)
  | { kind: 'unknown'; id: string };

// ---------- Respuestas crudas de valorant-api.com ----------

interface RawCard {
  uuid?: string;
  displayName?: string;
  displayIcon?: string | null;
  smallArt?: string | null;
  wideArt?: string | null;
  largeArt?: string | null;
}
interface RawBuddyLevel {
  uuid?: string;
  displayName?: string;
  displayIcon?: string | null;
  charmLevel?: number;
}
interface RawBuddy {
  uuid?: string;
  displayName?: string;
  displayIcon?: string | null;
  levels?: RawBuddyLevel[];
}
interface RawSprayLevel {
  uuid?: string;
}
interface RawSpray {
  uuid?: string;
  displayName?: string;
  displayIcon?: string | null;
  fullIcon?: string | null;
  animationPng?: string | null;
  animationGif?: string | null;
  levels?: RawSprayLevel[];
}
interface RawTitle {
  uuid?: string;
  displayName?: string;
  titleText?: string;
}
interface RawBundle {
  uuid?: string;
  displayName?: string;
  displayNameSubText?: string | null;
  description?: string | null;
  extraDescription?: string | null;
  displayIcon?: string | null;
  verticalPromoImage?: string | null;
}

const ITEMS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ITEMS_KEY = 'valo:items-catalog:v1';

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Construye el catálogo de accesorios (pura, testeable con fixtures). */
export function buildItemsCatalog(
  cardsData: RawCard[],
  buddiesData: RawBuddy[],
  spraysData: RawSpray[],
  titlesData: RawTitle[],
  bundlesData: RawBundle[],
): ItemsCatalog {
  const cards: Record<string, CardItem> = {};
  for (const c of cardsData) {
    if (!c.uuid || !c.displayName) continue;
    cards[c.uuid] = {
      id: c.uuid,
      name: clean(c.displayName),
      icon: c.displayIcon ?? c.smallArt ?? '',
      smallArt: c.smallArt ?? '',
      wideArt: c.wideArt ?? '',
      largeArt: c.largeArt ?? c.wideArt ?? c.displayIcon ?? '',
    };
  }

  // Buddies y sprays: el ItemID del storefront puede ser el uuid del padre o el
  // de su level -> se indexan ambos al mismo registro.
  const buddies: Record<string, BuddyItem> = {};
  for (const b of buddiesData) {
    if (!b.uuid || !b.displayName) continue;
    const levels: BuddyLevel[] = (b.levels ?? [])
      .filter((l) => l.uuid)
      .map((l, idx) => ({
        id: l.uuid!,
        name: clean(l.displayName ?? '') || `Nivel ${idx + 1}`,
        icon: l.displayIcon ?? b.displayIcon ?? '',
        level: l.charmLevel ?? idx + 1,
      }));
    const item: BuddyItem = {
      id: b.uuid,
      name: clean(b.displayName),
      icon: b.displayIcon ?? levels[0]?.icon ?? '',
      levels,
    };
    buddies[b.uuid] = item;
    for (const l of levels) buddies[l.id] = item;
  }

  const sprays: Record<string, SprayItem> = {};
  for (const s of spraysData) {
    if (!s.uuid || !s.displayName) continue;
    const item: SprayItem = {
      id: s.uuid,
      name: clean(s.displayName),
      icon: s.displayIcon ?? s.fullIcon ?? '',
      fullIcon: s.fullIcon ?? s.displayIcon ?? '',
      animationPng: s.animationPng ?? null,
      animationGif: s.animationGif ?? null,
    };
    sprays[s.uuid] = item;
    for (const l of s.levels ?? []) if (l.uuid) sprays[l.uuid] = item;
  }

  const titles: Record<string, TitleItem> = {};
  for (const t of titlesData) {
    if (!t.uuid || !t.displayName) continue;
    titles[t.uuid] = { id: t.uuid, name: clean(t.displayName), titleText: t.titleText ?? clean(t.displayName) };
  }

  const bundles: Record<string, BundleArt> = {};
  for (const b of bundlesData) {
    if (!b.uuid || !b.displayName) continue;
    bundles[b.uuid] = {
      id: b.uuid,
      name: clean(b.displayName),
      subName: b.displayNameSubText ? clean(b.displayNameSubText) : null,
      description: b.extraDescription ? clean(b.extraDescription) : b.description ? clean(b.description) : null,
      promoImage: b.verticalPromoImage ?? null,
      icon: b.displayIcon ?? null,
    };
  }

  return { cards, buddies, sprays, titles, bundles };
}

async function fetchItemsRaw(): Promise<ItemsCatalog> {
  const [cardsRes, buddiesRes, spraysRes, titlesRes, bundlesRes] = await Promise.all([
    fetch('https://valorant-api.com/v1/playercards', { signal: AbortSignal.timeout(30_000) }),
    fetch('https://valorant-api.com/v1/buddies', { signal: AbortSignal.timeout(30_000) }),
    fetch('https://valorant-api.com/v1/sprays', { signal: AbortSignal.timeout(30_000) }),
    fetch('https://valorant-api.com/v1/playertitles', { signal: AbortSignal.timeout(30_000) }),
    fetch('https://valorant-api.com/v1/bundles', { signal: AbortSignal.timeout(30_000) }),
  ]);
  if (!cardsRes.ok || !buddiesRes.ok || !spraysRes.ok || !titlesRes.ok || !bundlesRes.ok) {
    throw new Error(
      `catálogo de accesorios HTTP ${cardsRes.status}/${buddiesRes.status}/${spraysRes.status}/${titlesRes.status}/${bundlesRes.status}`,
    );
  }
  const cards = ((await cardsRes.json()) as { data?: RawCard[] }).data ?? [];
  const buddies = ((await buddiesRes.json()) as { data?: RawBuddy[] }).data ?? [];
  const sprays = ((await spraysRes.json()) as { data?: RawSpray[] }).data ?? [];
  const titles = ((await titlesRes.json()) as { data?: RawTitle[] }).data ?? [];
  const bundles = ((await bundlesRes.json()) as { data?: RawBundle[] }).data ?? [];
  return buildItemsCatalog(cards, buddies, sprays, titles, bundles);
}

export async function getItemsCatalog(): Promise<ItemsCatalog> {
  return cached(ITEMS_KEY, ITEMS_TTL_MS, fetchItemsRaw, (v) => {
    const cat = v as ItemsCatalog;
    return (
      !!cat?.cards &&
      Object.keys(cat.cards).length > 100 &&
      !!cat.buddies &&
      Object.keys(cat.buddies).length > 100 &&
      !!cat.sprays &&
      Object.keys(cat.sprays).length > 100 &&
      !!cat.titles &&
      !!cat.bundles
    );
  });
}

const EMPTY_CATALOG: ItemsCatalog = { cards: {}, buddies: {}, sprays: {}, titles: {}, bundles: {} };

/**
 * Resolución pura (testeable): decide qué es un ítem a partir del catálogo de
 * accesorios y de la skin ya resuelta. `itemType` es una pista; si falta o es
 * desconocida se prueban todos los catálogos (skin primero).
 */
export function pickStoreItem(
  id: string,
  itemType: string | undefined,
  cat: ItemsCatalog,
  skin: SkinInfo | null,
): StoreItem {
  if (!id) return { kind: 'unknown', id };

  if (itemType === ITEM_TYPES.skins || itemType === ITEM_TYPES.skinVariants) {
    return skin ? { kind: 'skin', ...skin } : { kind: 'unknown', id };
  }
  if (itemType === ITEM_TYPES.cards) return cat.cards[id] ? { kind: 'card', ...cat.cards[id] } : { kind: 'unknown', id };
  if (itemType === ITEM_TYPES.buddies) return cat.buddies[id] ? { kind: 'buddy', ...cat.buddies[id] } : { kind: 'unknown', id };
  if (itemType === ITEM_TYPES.sprays) return cat.sprays[id] ? { kind: 'spray', ...cat.sprays[id] } : { kind: 'unknown', id };
  if (itemType === ITEM_TYPES.titles) return cat.titles[id] ? { kind: 'title', ...cat.titles[id] } : { kind: 'unknown', id };

  // Tipo desconocido o ausente: skin primero, luego accesorios.
  if (skin) return { kind: 'skin', ...skin };
  if (cat.cards[id]) return { kind: 'card', ...cat.cards[id] };
  if (cat.buddies[id]) return { kind: 'buddy', ...cat.buddies[id] };
  if (cat.sprays[id]) return { kind: 'spray', ...cat.sprays[id] };
  if (cat.titles[id]) return { kind: 'title', ...cat.titles[id] };
  return { kind: 'unknown', id };
}

/** Resuelve un ítem del storefront (skin o accesorio) por uuid. */
export async function resolveStoreItem(id: string, itemType?: string): Promise<StoreItem> {
  if (!id) return { kind: 'unknown', id };

  const skinType = itemType === ITEM_TYPES.skins || itemType === ITEM_TYPES.skinVariants;
  const accessoryType =
    itemType === ITEM_TYPES.cards ||
    itemType === ITEM_TYPES.buddies ||
    itemType === ITEM_TYPES.sprays ||
    itemType === ITEM_TYPES.titles;

  // Carga perezosa: solo los catálogos que hacen falta. El enriquecimiento es
  // best-effort: si valorant-api falla, la tienda sigue (el ítem queda unknown).
  let skin: SkinInfo | null = null;
  if (skinType || !accessoryType) {
    try {
      skin = await getSkinById(id);
    } catch {
      skin = null;
    }
  }
  let cat: ItemsCatalog = EMPTY_CATALOG;
  if (accessoryType || !skinType) {
    try {
      cat = await getItemsCatalog();
    } catch {
      cat = EMPTY_CATALOG;
    }
  }
  return pickStoreItem(id, itemType, cat, skin);
}

/** Arte de un bundle por su uuid (best-effort; null si no se conoce o falla). */
export async function getBundleArt(id: string): Promise<BundleArt | null> {
  if (!id) return null;
  try {
    const cat = await getItemsCatalog();
    return cat.bundles[id] ?? null;
  } catch {
    return null;
  }
}
