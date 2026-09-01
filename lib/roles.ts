const KNOWN = new Set(['Duelist', 'Initiator', 'Controller', 'Sentinel']);

/** Fallback por nombre de agente si el catálogo de contenido no pudo dar el rol. */
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
  Omen: 'Controller',
  Brimstone: 'Controller',
  Astra: 'Controller',
  Viper: 'Controller',
  Harbor: 'Controller',
  Clove: 'Controller',
  Tejo: 'Initiator',
  Thresh: 'Controller',
  Sova: 'Initiator',
  Skye: 'Initiator',
  Gekko: 'Initiator',
  Fade: 'Initiator',
  Breach: 'Initiator',
  'KAY/O': 'Initiator',
};

export function agentRole(name: string, apiRole?: string | null): string | null {
  const r = apiRole ?? null;
  if (r && KNOWN.has(r)) return r;
  return FALLBACK[name] ?? null;
}
