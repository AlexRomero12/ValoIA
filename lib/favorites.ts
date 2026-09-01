import { readData, writeData } from './persist';
import { getSkinById } from './skins';

/**
 * Skins favoritas del usuario.
 *
 * IMPORTANTE — durabilidad: este store es EXTERNO al cache L1/L2. Vive en
 * `data/favorites.json` (volumen Docker `valo-data`) y NO se pierde al borrar
 * `.cache/` ni al reiniciar. Cada favorita guarda su SNAPSHOT denormalizado
 * (nombre, icono, arma), así la lista renderiza completa aunque el catálogo
 * de skins no esté disponible.
 */

export interface FavoriteSkin {
  offerId: string;
  name: string;
  icon: string;
  weapon: string;
  addedAt: number;
}

interface FavoritesFile {
  version: number;
  skins: FavoriteSkin[];
}

const FAVORITES_FILE = 'favorites.json';

function readFavorites(): FavoriteSkin[] {
  const file = readData<FavoritesFile>(FAVORITES_FILE, { version: 1, skins: [] });
  return Array.isArray(file?.skins) ? file.skins : [];
}

function writeFavorites(skins: FavoriteSkin[]): void {
  writeData(FAVORITES_FILE, { version: 1, skins });
}

export async function getFavorites(): Promise<FavoriteSkin[]> {
  return readFavorites();
}

export function isFavorite(offerId: string): boolean {
  return readFavorites().some((s) => s.offerId === offerId);
}

/** Añade una favorita (no-op si ya existe). Saca el snapshot del catálogo. */
export async function addFavorite(offerId: string): Promise<FavoriteSkin[]> {
  const current = readFavorites();
  if (current.some((s) => s.offerId === offerId)) return current;

  let name = 'Skin';
  let icon = '';
  let weapon = '';
  try {
    const skin = await getSkinById(offerId);
    if (skin) {
      name = skin.name;
      icon = skin.icon;
      weapon = skin.weapon;
    }
  } catch {
    // Sin catálogo: guardamos igualmente con nombre genérico; la próxima vez
    // que el catálogo esté disponible se puede re-enriquecer al mostrarla.
  }

  const next = [...current, { offerId, name, icon, weapon, addedAt: Date.now() }];
  writeFavorites(next);
  return next;
}

export function removeFavorite(offerId: string): FavoriteSkin[] {
  const next = readFavorites().filter((s) => s.offerId !== offerId);
  writeFavorites(next);
  return next;
}