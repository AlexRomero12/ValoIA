import { describe, expect, it } from 'vitest';
import { buildItemsCatalog, ITEM_TYPES, pickStoreItem } from './items';
import type { SkinInfo } from './skins';

const cat = buildItemsCatalog(
  [{ uuid: 'card1', displayName: 'Test Card', displayIcon: 'ci', smallArt: 's', wideArt: 'w', largeArt: 'l' }],
  [
    {
      uuid: 'bud1',
      displayName: 'Test Buddy',
      displayIcon: 'bi',
      levels: [
        { uuid: 'budlv1', charmLevel: 1, displayName: 'Test Buddy', displayIcon: 'bl1' },
        { uuid: 'budlv2', charmLevel: 2, displayName: 'Test Buddy L2', displayIcon: 'bl2' },
      ],
    },
  ],
  [{ uuid: 'spray1', displayName: 'Test Spray', displayIcon: 'si', fullIcon: 'fi', animationGif: 'gif1' }],
  [{ uuid: 'title1', displayName: 'Test Title', titleText: 'Test' }],
  [{ uuid: 'bundle1', displayName: 'Test Bundle', displayIcon: 'bd', verticalPromoImage: 'vp', extraDescription: 'desc' }],
);

const skin: SkinInfo = {
  id: 'skin1',
  name: 'Test Skin',
  icon: 'sk',
  weapon: 'Vandal',
  rarity: 'Premium',
  levelCount: 4,
  variantCount: 3,
};

describe('buildItemsCatalog', () => {
  it('indexa cards, sprays, títulos y bundles', () => {
    expect(cat.cards.card1.largeArt).toBe('l');
    expect(cat.sprays.spray1.animationGif).toBe('gif1');
    expect(cat.titles.title1.titleText).toBe('Test');
    expect(cat.bundles.bundle1.promoImage).toBe('vp');
    expect(cat.bundles.bundle1.description).toBe('desc');
  });

  it('indexa buddies por su uuid y por el de cada nivel', () => {
    expect(cat.buddies.bud1).toBe(cat.buddies.budlv2); // mismo registro
    expect(cat.buddies.bud1.levels).toHaveLength(2);
  });
});

describe('pickStoreItem', () => {
  it('resuelve skins (y variantes) por ItemTypeID', () => {
    expect(pickStoreItem('skin1', ITEM_TYPES.skins, cat, skin)).toMatchObject({ kind: 'skin', name: 'Test Skin' });
    expect(pickStoreItem('skin1', ITEM_TYPES.skinVariants, cat, skin)).toMatchObject({ kind: 'skin' });
  });

  it('resuelve accesorios por ItemTypeID', () => {
    expect(pickStoreItem('card1', ITEM_TYPES.cards, cat, null)).toMatchObject({ kind: 'card', name: 'Test Card' });
    expect(pickStoreItem('budlv2', ITEM_TYPES.buddies, cat, null)).toMatchObject({ kind: 'buddy', name: 'Test Buddy' });
    expect(pickStoreItem('spray1', ITEM_TYPES.sprays, cat, null)).toMatchObject({ kind: 'spray', animationGif: 'gif1' });
    expect(pickStoreItem('title1', ITEM_TYPES.titles, cat, null)).toMatchObject({ kind: 'title', titleText: 'Test' });
  });

  it('sin pista, prueba skin y luego accesorios', () => {
    expect(pickStoreItem('skin1', undefined, cat, skin)).toMatchObject({ kind: 'skin' });
    expect(pickStoreItem('card1', undefined, cat, null)).toMatchObject({ kind: 'card' });
  });

  it('devuelve unknown para ids desconocidos', () => {
    expect(pickStoreItem('nope', undefined, cat, null)).toEqual({ kind: 'unknown', id: 'nope' });
    expect(pickStoreItem('nope', ITEM_TYPES.sprays, cat, null)).toEqual({ kind: 'unknown', id: 'nope' });
  });
});
