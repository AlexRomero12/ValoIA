import { readData, writeDataSync, deleteData } from './persist';
import { getSkinById } from './skins';
import { adminUsername } from './auth';

/**
 * Skins favoritas POR USUARIO.
 *
 * IMPORTANTE — durabilidad: este store es EXTERNO al cache L1/L2. Vive en
 * `data/favorites.<usuario>.json` (volumen Docker `valo-data`) y NO se pierde
 * al borrar `.cache/` ni al reiniciar. Cada favorita guarda su SNAPSHOT
 * denormalizado (nombre, icono, arma), así la lista renderiza completa aunque
 * el catálogo de skins no esté disponible. El archivo global previo migra al
 * admin la primera vez.
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

function safeUser(user: string): string {
  return user.toLowerCase().replace(/[^a-z0-9._-]/g, '_');
}

function favoritesFile(user: string): string {
  return `favorites.${safeUser(user)}.json`;
}

function readFavorites(user: string): FavoriteSkin[] {
  const file = readData<FavoritesFile | null>(favoritesFile(user), null);
  if (file && Array.isArray(file.skins)) return file.skins;

  // Migración del archivo global (pre-multiusuario): solo para el admin.
  if (user === adminUsername()) {
    const legacy = readData<FavoritesFile>('favorites.json', { version: 1, skins: [] });
    if (Array.isArray(legacy?.skins) && legacy.skins.length > 0) {
      writeDataSync(favoritesFile(user), { version: 1, skins: legacy.skins });
      deleteData('favorites.json');
      return legacy.skins;
    }
  }
  return [];
}

function writeFavorites(user: string, skins: FavoriteSkin[]): void {
  writeDataSync(favoritesFile(user), { version: 1, skins });
}

export async function getFavorites(user: string): Promise<FavoriteSkin[]> {
  return readFavorites(user);
}

export function isFavorite(user: string, offerId: string): boolean {
  return readFavorites(user).some((s) => s.offerId === offerId);
}

/** Añade una favorita (no-op si ya existe). Saca el snapshot del catálogo. */
export async function addFavorite(user: string, offerId: string): Promise<FavoriteSkin[]> {
  const current = readFavorites(user);
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
  writeFavorites(user, next);
  return next;
}

export function removeFavorite(user: string, offerId: string): FavoriteSkin[] {
  const next = readFavorites(user).filter((s) => s.offerId !== offerId);
  writeFavorites(user, next);
  return next;
}
