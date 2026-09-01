export interface ProMetaAgent {
  agent: string;
  /** % de pick pro en ese mapa (108–121 mapas de VCT 2026 Americas Stage 2) */
  pick: number;
}

/**
 * Meta pro por mapa — pick rate de agentes en VCT 2026 Americas Stage 2
 * (fuente: https://www.vlr.gg/event/agents/2977/vct-2026-americas-stage-2, snapshot 28 ago 2026).
 *
 * Sirve para que las composiciones tengan sentido: un agente con +20% de pick
 * en pro es viable en el mapa; sin uso pro, el motor lo penaliza.
 */
/** Mapas en rotación de ranked del acto actual — solo se muestran estos. */
export const ROTATION_MAPS: string[] = ['Abyss', 'Ascent', 'Haven', 'Lotus', 'Split', 'Summit', 'Sunset'];

export const PRONETA: Record<string, ProMetaAgent[]> = {
  Sunset: [
    { agent: 'Omen', pick: 100 }, { agent: 'Neon', pick: 89 }, { agent: 'Cypher', pick: 57 },
    { agent: 'Sova', pick: 52 }, { agent: 'Chamber', pick: 43 }, { agent: 'Phoenix', pick: 41 },
    { agent: 'Fade', pick: 39 }, { agent: 'Sage', pick: 25 }, { agent: 'KAY/O', pick: 14 },
    { agent: 'Viper', pick: 9 }, { agent: 'Skye', pick: 9 }, { agent: 'Raze', pick: 7 },
    { agent: 'Deadlock', pick: 7 }, { agent: 'Waylay', pick: 7 }, { agent: 'Yoru', pick: 2 },
  ],
  Haven: [
    { agent: 'Sova', pick: 92 }, { agent: 'Neon', pick: 87 }, { agent: 'Phoenix', pick: 76 },
    { agent: 'Omen', pick: 71 }, { agent: 'Cypher', pick: 50 }, { agent: 'Chamber', pick: 42 },
    { agent: 'Astra', pick: 29 }, { agent: 'Viper', pick: 8 }, { agent: 'Fade', pick: 8 },
    { agent: 'Jett', pick: 8 }, { agent: 'Yoru', pick: 8 }, { agent: 'Vyse', pick: 5 },
    { agent: 'Breach', pick: 5 }, { agent: 'Waylay', pick: 5 }, { agent: 'Sage', pick: 3 },
    { agent: 'Killjoy', pick: 3 },
  ],
  Ascent: [
    { agent: 'Omen', pick: 100 }, { agent: 'Sova', pick: 100 }, { agent: 'Neon', pick: 54 },
    { agent: 'Phoenix', pick: 54 }, { agent: 'Cypher', pick: 50 }, { agent: 'Chamber', pick: 36 },
    { agent: 'Jett', pick: 36 }, { agent: 'KAY/O', pick: 18 }, { agent: 'Vyse', pick: 18 },
    { agent: 'Yoru', pick: 14 }, { agent: 'Veto', pick: 7 }, { agent: 'Waylay', pick: 7 },
    { agent: 'Deadlock', pick: 4 }, { agent: 'Killjoy', pick: 4 },
  ],
  Split: [
    { agent: 'Viper', pick: 100 }, { agent: 'Omen', pick: 96 }, { agent: 'Neon', pick: 71 },
    { agent: 'Fade', pick: 57 }, { agent: 'Phoenix', pick: 50 }, { agent: 'Skye', pick: 43 },
    { agent: 'Raze', pick: 29 }, { agent: 'Cypher', pick: 18 }, { agent: 'Jett', pick: 18 },
    { agent: 'Chamber', pick: 7 }, { agent: 'Waylay', pick: 7 }, { agent: 'Astra', pick: 4 },
  ],
  Summit: [
    { agent: 'Omen', pick: 73 }, { agent: 'Neon', pick: 73 }, { agent: 'Fade', pick: 62 },
    { agent: 'Chamber', pick: 42 }, { agent: 'Cypher', pick: 38 }, { agent: 'KAY/O', pick: 35 },
    { agent: 'Sova', pick: 31 }, { agent: 'Waylay', pick: 23 }, { agent: 'Sage', pick: 23 },
    { agent: 'Harbor', pick: 23 }, { agent: 'Viper', pick: 19 }, { agent: 'Phoenix', pick: 15 },
    { agent: 'Vyse', pick: 12 }, { agent: 'Brimstone', pick: 12 }, { agent: 'Jett', pick: 4 },
    { agent: 'Raze', pick: 4 }, { agent: 'Skye', pick: 4 }, { agent: 'Astra', pick: 4 },
    { agent: 'Tejo', pick: 4 },
  ],
  Lotus: [
    { agent: 'Omen', pick: 100 }, { agent: 'Viper', pick: 88 }, { agent: 'Fade', pick: 83 },
    { agent: 'Raze', pick: 67 }, { agent: 'Vyse', pick: 63 }, { agent: 'Neon', pick: 38 },
    { agent: 'Chamber', pick: 17 }, { agent: 'Skye', pick: 17 }, { agent: 'Cypher', pick: 13 },
    { agent: 'Waylay', pick: 8 }, { agent: 'Yoru', pick: 8 },
  ],
  Abyss: [
    { agent: 'Sova', pick: 100 }, { agent: 'Phoenix', pick: 100 }, { agent: 'Astra', pick: 100 },
    { agent: 'Neon', pick: 50 }, { agent: 'Chamber', pick: 50 }, { agent: 'Jett', pick: 50 },
    { agent: 'Vyse', pick: 50 },
  ],
};

export function pronetaFor(map: string): ProMetaAgent[] {
  return PRONETA[map] ?? [];
}

export function metaPickOf(map: string, agent: string): number {
  return pronetaFor(map).find((e) => e.agent === agent)?.pick ?? 0;
}
