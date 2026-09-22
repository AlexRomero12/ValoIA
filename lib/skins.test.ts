import { describe, expect, it } from 'vitest';
import {
  buildCatalog,
  type ContentTierEntry,
  type SkinlevelEntry,
  type ThemeEntry,
  type WeaponEntry,
} from './skins';

const levels: SkinlevelEntry[] = [
  { uuid: 'base1', displayName: 'Test Vandal', displayIcon: 'icon-base' },
  { uuid: 'lv2', displayName: 'Test Vandal Level 2' }, // sin displayIcon
];

const weapons: WeaponEntry[] = [
  {
    displayName: 'Vandal',
    skins: [
      {
        displayName: 'Test Vandal',
        contentTierUuid: 'tier1',
        themeUuid: 'theme1',
        levels: [
          { uuid: 'base1', displayName: 'Test Vandal', displayIcon: 'icon-base', streamedVideo: 'vid-base' },
          { uuid: 'lv2', displayName: 'Test Vandal Level 2', displayIcon: null, streamedVideo: 'vid-lv2' },
        ],
        chromas: [
          { uuid: 'chr0', displayName: 'Test Vandal' },
          { uuid: 'chr1', displayName: 'Test Vandal (Variant 1 Orange)', fullRender: 'render-chr1', streamedVideo: 'vid-chr1' },
        ],
      },
    ],
  },
];

const tiers: ContentTierEntry[] = [
  { uuid: 'tier1', devName: 'Premium', displayName: 'Premium Edition', highlightColor: 'd1548d33' },
];
const themes: ThemeEntry[] = [{ uuid: 'theme1', displayName: 'Test Collection' }];

describe('buildCatalog', () => {
  const cat = buildCatalog(levels, weapons, tiers, themes);

  it('enriquece cada skin con rareza, colección y conteos', () => {
    const base = cat.byId['base1'];
    expect(base.rarity).toBe('Premium'); // devName corto, no "Premium Edition"
    expect(base.rarityColor).toBe('#d1548d');
    expect(base.collection).toBe('Test Collection');
    expect(base.levelCount).toBe(2);
    expect(base.variantCount).toBe(1); // 2 chromas - 1 estándar
  });

  it('indexa chromas por su uuid usando el fullRender', () => {
    const chroma = cat.byId['chr1'];
    expect(chroma.icon).toBe('render-chr1');
    expect(chroma.name).toBe('Test Vandal (Variant 1 Orange)');
    // El chroma estándar duplica el nombre del skinlevel: no entra en byId.
    expect(cat.byId['chr0']).toBeUndefined();
  });

  it('expone niveles y variantes con su vídeo ingame', () => {
    const variants = cat.variantsBySkinId['base1'];
    expect(variants).toBe(cat.variantsBySkinId['chr1']); // misma skin
    expect(variants.levels.map((l) => l.label)).toEqual(['Base', 'Nivel 2']);
    expect(variants.levels[1].icon).toBe(''); // sin render en la API
    expect(variants.levels[1].video).toBe('vid-lv2');
    expect(variants.chromas[1].label).toBe('Variant 1 Orange');
    expect(variants.chromas[1].fullRender).toBe('render-chr1');
    expect(variants.chromas[1].video).toBe('vid-chr1');
  });

  it('solo agrupa skins base en el arsenal', () => {
    const vandal = cat.weapons.find((w) => w.name === 'Vandal');
    expect(vandal?.skins.map((s) => s.id)).toEqual(['base1']);
  });

  it('usa Records serializables (la caché en disco no pierde los índices)', () => {
    const roundTrip = JSON.parse(JSON.stringify(cat)) as typeof cat;
    expect(Object.keys(roundTrip.byId)).toContain('base1');
    expect(Object.keys(roundTrip.variantsBySkinId)).toContain('lv2');
  });
});
