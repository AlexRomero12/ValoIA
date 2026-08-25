export interface TeamMember {
  id: string;
  name: string;
  tag: string;
  label: string;
  role: string;
}

const TEAM: TeamMember[] = [
  { id: 'alex', name: 'AlexRomero12', tag: 'LAN', label: 'Alex', role: 'Duelist/Sentinel' },
  { id: 'nomirc', name: 'NoMicr', tag: '0000', label: 'NoMicr', role: 'Sentinel' },
  { id: 'gengar', name: 'Gengar 十六', tag: '0616', label: 'Gengar', role: 'Flex Sentinel/Controller' },
  { id: 'juan', name: 'ツJuanツ', tag: 'lol', label: 'Juan', role: 'Initiator/Controller' },
];

export function getTeam(): TeamMember[] {
  return TEAM;
}

export function resolvePlayer(playerId?: string | null): TeamMember {
  return TEAM.find((m) => m.id === playerId) ?? TEAM[0];
}

export function isValidPlayer(playerId?: string | null): boolean {
  if (!playerId) return true;
  return TEAM.some((m) => m.id === playerId);
}
