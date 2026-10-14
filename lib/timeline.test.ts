import { describe, expect, it } from 'vitest';
import { projectWorld, resolveWeapon, screenAngle } from './timeline';
import { MAP_UNITS, roundClock, roundMoments, type TimelineKill, type TimelineRound } from './timelineView';
import type { MapCalibration } from './valorant';

/**
 * Los mapas de la API van con los ejes del mundo intercambiados respecto a la
 * fórmula publicada. La calibración correcta se obtuvo ajustando 8.223 puntos
 * reales de Sunset (kills, plantas y defuses) contra la máscara de suelo
 * jugable del minimapa, y se verificó en los 11 mapas del archivo con 99-100%
 * de acierto. Con el orden «natural» de la fórmula solo acierta el 65%.
 */
const SUNSET: MapCalibration = {
  xMultiplier: 7.8e-5,
  yMultiplier: -7.8e-5,
  xScalarToAdd: 0.5,
  yScalarToAdd: 0.515625,
};

describe('projectWorld · mundo -> minimapa', () => {
  it('coloca una planta del sitio A en el sitio A', () => {
    // Planta real del archivo, sitio A de Sunset.
    const p = projectWorld(1615, 4578, SUNSET);
    expect(p).toEqual({ u: 857, v: 390 });
  });

  it('coloca una planta del sitio B en el sitio B', () => {
    // Las plantas del sitio B tienen el eje Y del mundo en negativo.
    const p = projectWorld(696, -4342, SUNSET);
    expect(p).toEqual({ u: 161, v: 461 });
  });

  it('los dos sitios caen en mitades opuestas de la imagen', () => {
    const a = projectWorld(1615, 4578, SUNSET);
    const b = projectWorld(696, -4342, SUNSET);
    // El eje Y del mundo manda en la horizontal: A a la derecha, B a la izquierda.
    expect(a.u).toBeGreaterThan(500);
    expect(b.u).toBeLessThan(500);
  });

  it('el eje X del mundo manda en la vertical: ataque abajo, defensa arriba', () => {
    // Los spawns son coordenadas reales de los callouts de Sunset: el de ataque
    // está en x≈-6025 y el de defensa en x≈3805, y en el minimapa el de ataque
    // es la cola de abajo. Es el multiplicador NEGATIVO del eje X lo que
    // invierte la vertical, así que X creciente sube en la imagen.
    const spawnAtaque = projectWorld(-6025, -400, SUNSET);
    const spawnDefensa = projectWorld(3805, -1989, SUNSET);
    expect(spawnAtaque.v).toBeGreaterThan(spawnDefensa.v);
    expect(spawnAtaque.v).toBeGreaterThan(900);
    expect(spawnDefensa.v).toBeLessThan(300);
  });

  it('recorta a los límites en vez de salirse del plano', () => {
    // u depende del eje Y del mundo y v del X: por eso cada extremo recorta en
    // un canal distinto.
    expect(projectWorld(1e9, 1e9, SUNSET)).toEqual({ u: MAP_UNITS, v: 0 });
    expect(projectWorld(-1e9, -1e9, SUNSET)).toEqual({ u: 0, v: MAP_UNITS });
  });

  it('una coordenada no finita no rompe la proyección', () => {
    expect(projectWorld(Number.NaN, 0, SUNSET)).toEqual({ u: 500, v: 0 });
  });
});

describe('screenAngle · ángulo de visión a grados de pantalla', () => {
  it('mirar hacia +X del mundo es mirar hacia arriba en el plano', () => {
    expect(screenAngle(0)).toBeCloseTo(-90, 5);
  });

  it('mirar hacia +Y del mundo es mirar hacia la derecha en el plano', () => {
    // Consecuencia directa del intercambio de ejes: si el eje Y del mundo
    // alimenta la horizontal, +Y del mundo se ve a la derecha.
    expect(screenAngle(Math.PI / 2)).toBeCloseTo(0, 5);
  });

  it('los cuatro rumbos del mundo caen en los cuatro de la pantalla', () => {
    // -180° y 180° son el mismo rumbo: se comparan por valor absoluto para no
    // depender del signo que devuelva atan2 en el eje.
    expect(screenAngle(0)).toBeCloseTo(-90, 4);
    expect(screenAngle(Math.PI / 2)).toBeCloseTo(0, 4);
    expect(screenAngle(Math.PI)).toBeCloseTo(90, 4);
    expect(Math.abs(screenAngle(-Math.PI / 2))).toBeCloseTo(180, 4);
  });
});

describe('resolveWeapon · de dónde sale el arma de cada kill', () => {
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
    const w = resolveWeapon(
      { weapon: { id: 'id-desconocido', type: 'Weapon' } },
      dicts,
      'Vandal',
      'Sova',
    );
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

function kill(t: number): TimelineKill {
  return { t, k: 0, v: 1, a: [], w: { name: 'Vandal', icon: null, kind: 'weapon', secondary: false }, at: null, views: [] };
}

function round(partial: Partial<TimelineRound>): TimelineRound {
  return { n: 1, won: true, side: 'atk', result: 'Elimination', plant: null, defuse: null, kills: [], eco: [], ...partial };
}

describe('roundMoments · el orden que recorre el scrubber', () => {
  it('mezcla kills, planta y defuse por tiempo', () => {
    const r = round({
      kills: [kill(30_000), kill(9_000), kill(45_000)],
      plant: { u: 100, v: 100, by: 2, t: 20_000, views: [], site: 'A' },
      defuse: { u: 200, v: 200, by: 3, t: 60_000, views: [] },
    });
    expect(roundMoments(r).map((m) => [m.kind, m.t])).toEqual([
      ['kill', 9_000],
      ['plant', 20_000],
      ['kill', 30_000],
      ['kill', 45_000],
      ['defuse', 60_000],
    ]);
  });

  it('la planta conserva el sitio y quién la puso', () => {
    const r = round({ plant: { u: 100, v: 100, by: 7, t: 1_000, views: [], site: 'B' } });
    const [m] = roundMoments(r);
    expect(m).toMatchObject({ kind: 'plant', by: 7, site: 'B' });
  });

  it('una ronda sin eventos no inventa momentos', () => {
    expect(roundMoments(round({}))).toEqual([]);
  });

  it('el momento de una kill apunta a la kill original (el feed salta a él)', () => {
    const k = kill(5_000);
    const [m] = roundMoments(round({ kills: [k] }));
    expect(m.kill).toBe(k);
  });
});

describe('roundClock · el reloj de la ronda', () => {
  it('pasa de milisegundos a minuto:segundo', () => {
    expect(roundClock(0)).toBe('0:00');
    expect(roundClock(9_494)).toBe('0:09');
    expect(roundClock(84_000)).toBe('1:24');
    expect(roundClock(600_000)).toBe('10:00');
  });

  it('rellena los segundos a dos cifras', () => {
    expect(roundClock(65_000)).toBe('1:05');
  });
});
