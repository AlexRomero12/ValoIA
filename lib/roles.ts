const KNOWN = new Set(['Duelist', 'Initiator', 'Controller', 'Sentinel']);

/** Roles jugables, en orden de display (y reparto de composiciones). */
export const ROLES = ['Duelist', 'Initiator', 'Controller', 'Sentinel'] as const;

/**
 * Fallback por nombre de agente si el catálogo de contenido (valorant-api.com)
 * no pudo dar el rol. Sincronizado con `/v1/agents?isPlayableCharacter=true`
 * (29 agentes, 22 sep 2026): añade aquí cada agente nuevo (p. ej. Miks, Veto)
 * para que Reglas/Team no se queden sin rol cuando el catálogo falla.
 */
const FALLBACK: Record<string, string> = {
  Jett: 'Duelist',
  Raze: 'Duelist',
  Reyna: 'Duelist',
  Phoenix: 'Duelist',
  Yoru: 'Duelist',
  Neon: 'Duelist',
  Iso: 'Duelist',
  Waylay: 'Duelist',
  Sage: 'Sentinel',
  Chamber: 'Sentinel',
  Killjoy: 'Sentinel',
  Cypher: 'Sentinel',
  Deadlock: 'Sentinel',
  Vyse: 'Sentinel',
  Veto: 'Sentinel',
  Omen: 'Controller',
  Brimstone: 'Controller',
  Astra: 'Controller',
  Viper: 'Controller',
  Harbor: 'Controller',
  Clove: 'Controller',
  Miks: 'Controller',
  Sova: 'Initiator',
  Skye: 'Initiator',
  Gekko: 'Initiator',
  Fade: 'Initiator',
  Breach: 'Initiator',
  Tejo: 'Initiator',
  'KAY/O': 'Initiator',
};

export function agentRole(name: string, apiRole?: string | null): string | null {
  const r = apiRole ?? null;
  if (r && KNOWN.has(r)) return r;
  return FALLBACK[name] ?? null;
}
