export interface TeamAccount {
  name: string;
  tag: string;
}

export interface TeamMember {
  id: string;
  name: string;
  tag: string;
  label: string;
  role: string;
  /** Cuentas alternativas del mismo jugador; sus stats se mezclan en la vista Comparar */
  accounts?: TeamAccount[];
  /** Preferencias manuales: agente por mapa, ganan al score automático */
  prefs?: { map: string; agents: string[] }[];
}

const TEAM: TeamMember[] = [
  {
    id: 'player',
    name: 'Player',
    tag: 'LAN',
    label: 'Player',
    role: 'Duelist/Sentinel',
    prefs: [
      { map: 'Haven', agents: ['Chamber'] },
      { map: 'Sunset', agents: ['Chamber'] },
      { map: 'Split', agents: ['Sage', 'Raze', 'Jett'] },
    ],
  },
  {
    id: 'player2',
    name: 'Player2',
    tag: '0000',
    label: 'Player2',
    role: 'Sentinel',
    prefs: [
      { map: 'Haven', agents: ['Yoru', 'Cypher'] },
      { map: 'Ascent', agents: ['Killjoy'] },
    ],
  },
  { id: 'player3', name: 'Player3 十六', tag: '0616', label: 'Player3', role: 'Flex Sentinel/Controller' },
  {
    id: 'player4',
    name: 'Player4',
    tag: 'lol',
    label: 'Player4',
    role: 'Initiator/Controller',
    accounts: [
      { name: 'Player4', tag: 'Rol' },
      { name: 'Player5', tag: 'NA1' },
    ],
    prefs: [
      { map: 'Haven', agents: ['Sova'] },
      { map: 'Ascent', agents: ['Sova'] },
      { map: 'Abyss', agents: ['Sova'] },
    ],
  },
];

export function getTeam(): TeamMember[] {
  return TEAM;
}

/** Lista de cuentas (principal + alternativas) de un miembro del equipo. */
export function memberAccounts(member: TeamMember): TeamAccount[] {
  return [{ name: member.name, tag: member.tag }, ...(member.accounts ?? [])];
}

export function resolvePlayer(playerId?: string | null): TeamMember {
  return TEAM.find((m) => m.id === playerId) ?? TEAM[0];
}

export function isValidPlayer(playerId?: string | null): boolean {
  if (!playerId) return true;
  return TEAM.some((m) => m.id === playerId);
}
