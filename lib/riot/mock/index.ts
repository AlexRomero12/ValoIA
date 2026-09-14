import fixturesJson from './fixtures.json';
import matchlistJson from './matchlist.json';
import type { RiotMatchDto, RiotMatchlistDto } from '../types';

/**
 * Fixtures del mock de VAL-MATCH-V1, con la forma exacta de la API productiva.
 * Se regeneran desde el archivo real de Alex con:
 *   node scripts/gen-riot-fixtures.mjs
 */

const fixtures = fixturesJson as unknown as Record<string, RiotMatchDto>;
const matchlist = matchlistJson as unknown as RiotMatchlistDto;

export function getMockMatchlist(): RiotMatchlistDto {
  return matchlist;
}

export function getMockMatch(matchId: string): RiotMatchDto | null {
  return fixtures[matchId] ?? null;
}

export function getMockFixtureCount(): number {
  return Object.keys(fixtures).length;
}

export function getMockPuuid(): string {
  return matchlist.puuid;
}
