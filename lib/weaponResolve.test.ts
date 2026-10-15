import { describe, expect, it } from 'vitest';
import { resolveWeapon, resolveWeaponIn, weaponContext, weaponDictsFrom } from './weaponResolve';
import type { HenrikMatch } from './henrik';

const dicts = {
  weapons: new Map<string, string | null>([
    ['vandal', 'vandal.png'],
    ['classic', 'classic.png'],
    ['melee', 'melee.png'],
  ]),
  abilities: new Map<string, string | null>([
    ['blade storm', 'blade.png'],
    ['headhunter', 'headhunter.png'],
    ['tour de force', 'tdf.png'],
    ['overdrive', 'overdrive.png'],
  ]),
};

describe('resolveWeapon · de dónde sale el arma de cada kill', () => {
  it('usa el arma del feed cuando viene', () => {
    const w = resolveWeapon({ weapon: { name: 'Vandal', type: 'Weapon' } }, dicts, null);
    expect(w).toEqual({ name: 'Vandal', icon: 'vandal.png', kind: 'weapon', secondary: false });
  });

  it('una habilidad se busca en el diccionario de habilidades, no en el de armas', () => {
    const w = resolveWeapon({ weapon: { name: 'Blade Storm', type: 'Ability' } }, dicts, null);
    expect(w).toMatchObject({ name: 'Blade Storm', icon: 'blade.png', kind: 'ability' });
  });

  it('la explosión del spike no es un arma', () => {
    const w = resolveWeapon({ weapon: { type: 'Bomb' } }, dicts, null);
    expect(w).toMatchObject({ name: 'Spike', kind: 'spike', icon: null });
  });

  it('la caída tampoco', () => {
    expect(resolveWeapon({ weapon: { type: 'Fall' } }, dicts, null)).toMatchObject({
      name: 'Caída',
      kind: 'fall',
    });
  });

  it('el melee sí tiene icono en el catálogo', () => {
    expect(resolveWeapon({ weapon: { type: 'Melee' } }, dicts, null)).toMatchObject({
      name: 'Melee',
      kind: 'melee',
      icon: 'melee.png',
    });
  });

  // Riot manda las armas de habilidad como `type: "Weapon"` y sin nombre. Antes
  // se caía al arma comprada y salía un «≈Classic» que no era: la kill la hizo
  // la habilidad.
  it('la Headhunter de Chamber se resuelve por su id, no por el arma comprada', () => {
    const w = resolveWeapon(
      { weapon: { id: '856d9a7e-4b06-dc37-15dc-9d809c37cb90', type: 'Weapon' }, secondary_fire_mode: true },
      dicts,
      'Classic',
      'Chamber',
    );
    expect(w).toEqual({
      name: 'Headhunter',
      icon: 'headhunter.png',
      kind: 'ability',
      secondary: true,
    });
  });

  it('la Tour De Force se resuelve por su id', () => {
    const w = resolveWeapon(
      { weapon: { id: '39099fb5-4293-def4-1e09-2e9080ce7456', type: 'Weapon' } },
      dicts,
      'Operator',
      'Chamber',
    );
    expect(w).toMatchObject({ name: 'Tour De Force', icon: 'tdf.png', kind: 'ability' });
  });

  it('sin id, el agente delata el arma de habilidad (marcada como deducida)', () => {
    // 775 kills del archivo sin id son el 100% de Chamber y ninguna cae en
    // ronda de pistola: es su definitiva, no la Headhunter.
    const w = resolveWeapon(
      { weapon: { type: 'Weapon' }, secondary_fire_mode: true },
      dicts,
      'Classic',
      'Chamber',
    );
    expect(w).toEqual({
      name: 'Tour De Force',
      icon: 'tdf.png',
      kind: 'ability',
      secondary: true,
      inferred: true,
    });
  });

  it('la Overdrive de Neon se resuelve por su id', () => {
    const w = resolveWeapon(
      { weapon: { id: '95336ae4-45d4-1032-cfaf-6bad01910607', type: 'Weapon' } },
      dicts,
      'Vandal',
      'Neon',
    );
    expect(w).toMatchObject({ name: 'Overdrive', icon: 'overdrive.png', kind: 'ability' });
  });

  it('una habilidad sin nombre no se atribuye al arma comprada', () => {
    // El id genérico `grenadeability`: la mató una habilidad, no la Vandal.
    const w = resolveWeapon({ weapon: { id: 'grenadeability', type: 'Ability' } }, dicts, 'Vandal', 'Killjoy');
    expect(w).toEqual({ name: 'Habilidad', icon: null, kind: 'ability', secondary: false });
  });

  it('un arma normal sin nombre sí cae a lo que compró esa ronda', () => {
    const w = resolveWeapon({ weapon: { id: 'id-desconocido', type: 'Weapon' } }, dicts, 'Vandal', 'Sova');
    expect(w).toEqual({
      name: 'Vandal',
      icon: 'vandal.png',
      kind: 'weapon',
      secondary: false,
      inferred: true,
    });
  });

  it('sin nombre y sin economía no inventa un arma', () => {
    expect(resolveWeapon({ weapon: { type: 'Weapon' } }, dicts, null, 'Sova')).toEqual({
      name: '—',
      icon: null,
      kind: 'weapon',
      secondary: false,
    });
  });

  it('un arma fuera del catálogo se muestra igual, sin icono', () => {
    const w = resolveWeapon({ weapon: { name: 'Bandit', type: 'Weapon' } }, dicts, null);
    expect(w).toEqual({ name: 'Bandit', icon: null, kind: 'weapon', secondary: false });
  });
});

describe('weaponDictsFrom · diccionarios desde el contenido cacheado', () => {
  it('indexa armas y habilidades por su nombre en minúsculas', () => {
    const d = weaponDictsFrom({
      weapons: { vandal: { icon: 'v.png' }, classic: { icon: null } },
      abilities: { headhunter: { icon: 'h.png' } },
    });
    expect(d.weapons.get('vandal')).toBe('v.png');
    expect(d.weapons.get('classic')).toBeNull();
    expect(d.abilities.get('headhunter')).toBe('h.png');
  });

  it('un contenido vacío no rompe', () => {
    const d = weaponDictsFrom({});
    expect(d.weapons.size).toBe(0);
    expect(d.abilities.size).toBe(0);
  });
});

describe('weaponContext / resolveWeaponIn · la partida entera de una vez', () => {
  const match: HenrikMatch = {
    metadata: {},
    players: [
      { puuid: 'chamber', name: 'A', agent: { name: 'Chamber' } },
      { puuid: 'sova', name: 'B', agent: { name: 'Sova' } },
    ],
    rounds: [
      {
        id: 0,
        stats: [
          { player: { puuid: 'chamber' }, economy: { weapon: { name: 'Classic' } } },
          { player: { puuid: 'sova' }, economy: { weapon: { name: 'Vandal' } } },
        ],
      },
      { id: 1, stats: [{ player: { puuid: 'chamber' }, economy: { weapon: { name: 'Sheriff' } } }] },
    ],
    kills: [],
  };

  it('indexa agente por puuid y compra por ronda', () => {
    const ctx = weaponContext(match, dicts);
    expect(ctx.agentByPuuid.get('chamber')).toBe('Chamber');
    expect(ctx.ecoByRound.get('0|chamber')).toBe('Classic');
    expect(ctx.ecoByRound.get('1|chamber')).toBe('Sheriff');
    expect(ctx.ecoByRound.get('1|sova')).toBeUndefined();
  });

  it('resuelve una kill de habilidad sin nombre usando el agente de la partida', () => {
    const ctx = weaponContext(match, dicts);
    const w = resolveWeaponIn(ctx, { round: 0, killer: { puuid: 'chamber' }, weapon: { type: 'Weapon' } });
    expect(w).toMatchObject({ name: 'Tour De Force', kind: 'ability', inferred: true });
  });

  it('cae a la compra de ESA ronda, no a otra', () => {
    const ctx = weaponContext(match, dicts);
    const r0 = resolveWeaponIn(ctx, { round: 0, killer: { puuid: 'sova' }, weapon: { type: 'Weapon' } });
    const r1 = resolveWeaponIn(ctx, { round: 1, killer: { puuid: 'sova' }, weapon: { type: 'Weapon' } });
    expect(r0.name).toBe('Vandal');
    // En la ronda 1 Sova no tiene compra registrada: no se inventa nada.
    expect(r1.name).toBe('—');
  });

  it('una kill sin asesino no revienta', () => {
    const ctx = weaponContext(match, dicts);
    const w = resolveWeaponIn(ctx, { round: 0, weapon: { type: 'Weapon' } });
    expect(w.name).toBe('—');
  });
});
