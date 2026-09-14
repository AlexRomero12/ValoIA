/**
 * DTOs de la API oficial de Riot (VAL-MATCH-V1 / ACCOUNT-V1 / VAL-CONTENT-V1).
 * Solo se declaran los campos que consume el mapper; el mock produce
 * exactamente estas formas, de modo que al pasar a producción no cambia nada.
 */

export interface RiotAccountDto {
  puuid: string;
  gameName?: string;
  tagLine?: string;
}

export interface RiotActiveShardDto {
  puuid: string;
  game: string;
  activeShard?: string;
}

export interface RiotMatchlistEntry {
  matchId: string;
  gameStartTimeMillis: number;
  teamId?: string;
}

export interface RiotMatchlistDto {
  puuid: string;
  history: RiotMatchlistEntry[];
}

export interface RiotMatchInfoDto {
  matchId: string;
  mapId?: string;
  gameVersion?: string;
  gameLengthMillis?: number | null;
  gameStartMillis?: number;
  provisioningFlowID?: string;
  isCompleted?: boolean;
  queueID?: string;
  gameMode?: string;
  isRanked?: boolean;
}

export interface RiotAbilityCastsDto {
  grenadeCasts?: number;
  ability1Casts?: number;
  ability2Casts?: number;
  ultimateCasts?: number;
}

export interface RiotPlayerStatsDto {
  score?: number;
  roundsPlayed?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  playtimeMillis?: number;
  abilityCasts?: RiotAbilityCastsDto | null;
}

export interface RiotPlayerDto {
  puuid: string;
  gameName?: string;
  tagLine?: string;
  teamId?: string;
  partyId?: string;
  characterId?: string;
  stats?: RiotPlayerStatsDto;
  competitiveTier?: number;
  isObserver?: boolean;
  playerCard?: string;
  playerTitle?: string;
}

export interface RiotTeamDto {
  teamId?: string;
  won?: boolean;
  roundsPlayed?: number;
  roundsWon?: number;
  numPoints?: number;
}

export interface RiotFinishingDamageDto {
  damageType?: string;
  damageItem?: string;
  isSecondaryFireMode?: boolean;
}

export interface RiotKillDto {
  timeSinceGameStartMillis?: number;
  timeSinceRoundStartMillis?: number;
  killer?: string;
  victim?: string;
  victims?: string[];
  assistants?: string[];
  finishingDamage?: RiotFinishingDamageDto;
}

export interface RiotDamageDto {
  receiver?: string;
  damage?: number;
  legshots?: number;
  bodyshots?: number;
  headshots?: number;
}

export interface RiotEconomyDto {
  loadoutValue?: number;
  weapon?: string;
  armor?: string;
  remaining?: number;
  spent?: number;
}

export interface RiotPlayerRoundStatsDto {
  puuid?: string;
  kills?: RiotKillDto[];
  damage?: RiotDamageDto[];
  score?: number;
  economy?: RiotEconomyDto;
  ability?: { grenadeEffects?: string | null; ability1Effects?: string | null; ability2Effects?: string | null; ultimateEffects?: string | null };
  wasAfk?: boolean;
  wasPenalized?: boolean;
}

export interface RiotRoundResultDto {
  roundNum?: number;
  roundResult?: string;
  roundCeremony?: string;
  winningTeam?: string;
  bombPlanter?: string;
  bombDefuser?: string;
  plantRoundTime?: number;
  plantSite?: string;
  defuseRoundTime?: number;
  playerStats?: RiotPlayerRoundStatsDto[];
  roundResultCode?: string;
}

export interface RiotMatchDto {
  matchInfo: RiotMatchInfoDto;
  players: RiotPlayerDto[];
  coaches?: unknown[];
  teams?: RiotTeamDto[] | null;
  roundResults?: RiotRoundResultDto[] | null;
}

export interface RiotActDto {
  id: string;
  name?: string;
  isActive?: boolean;
  startTime?: number;
  endTime?: number;
}

export interface RiotContentDto {
  version?: string;
  characters?: { id: string; name?: string; assetName?: string }[];
  maps?: { id: string; name?: string; assetName?: string }[];
  acts?: RiotActDto[];
}
