export interface TeamMember {
  id: string;
  name: string;
  tag: string;
  label: string;
  role: string;
}

const TEAM: TeamMember[] = [
  { id: 'player', name: 'Player', tag: 'LAN', label: 'Player', role: 'Duelist/Sentinel' },
  { id: 'player2', name: 'Player2', tag: '0000', label: 'Player2', role: 'Sentinel' },
  { id: 'player3', name: 'Player3 十六', tag: '0616', label: 'Player3', role: 'Flex Sentinel/Controller' },
  { id: 'player4', name: 'Player4', tag: 'lol', label: 'Player4', role: 'Initiator/Controller' },
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
