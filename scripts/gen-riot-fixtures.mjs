#!/usr/bin/env node
/**
 * Genera los fixtures del mock de VAL-MATCH-V1 a partir del archivo
 * acumulativo de Henrik (data/archive/{name}_{tag}).
 *
 * El resultado son DTOs EXACTAMENTE con la forma de la API productiva de Riot,
 * de modo que el mismo mapper (`lib/riot/mapper.ts`) se usa hoy con mock y
 * mañana con `RIOT_MATCH_SOURCE=live` sin cambios.
 *
 * Uso:
 *   node scripts/gen-riot-fixtures.mjs [name] [tag] [limit]
 * Defaults: AlexRomero12 LAN 12
 *
 * Los totales de daño/disparos se reparten por rondas de forma determinista
 * (base + resto) para que la re-agregación del mapper conserve los totales.
 */

import fs from 'node:fs';
import path from 'node:path';

const NAME = process.argv[2] ?? 'AlexRomero12';
const TAG = process.argv[3] ?? 'LAN';
const LIMIT = Math.max(1, Number(process.argv[4] ?? 12) || 12);

const archiveDir = path.resolve(process.cwd(), 'data', 'archive', `${NAME.replace(/[^a-zA-Z0-9_-]/g, '_')}_${TAG.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
const outDir = path.resolve(process.cwd(), 'lib', 'riot', 'mock');

function splitTotal(total, rounds, index) {
  const n = Math.max(1, rounds);
  const base = Math.floor(total / n);
  const rem = total - base * n;
  return base + (index < rem ? 1 : 0);
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

function loadMatches() {
  const files = fs.readdirSync(archiveDir).filter((f) => f.endsWith('.json') && f !== 'index.json');
  const matches = [];
  for (const f of files) {
    try {
      const raw = fs.readFileSync(path.join(archiveDir, f), 'utf8').replace(/^\uFEFF/, '');
      matches.push(JSON.parse(raw));
    } catch {
      /* archivo corrupto: se ignora */
    }
  }
  return matches
    .filter((m) => m?.metadata?.is_completed !== false)
    .filter((m) => (m?.metadata?.queue?.id ?? '').toLowerCase() === 'competitive')
    .filter((m) => Array.isArray(m?.players) && m.players.length > 0)
    .sort((a, b) => Date.parse(b.metadata.started_at) - Date.parse(a.metadata.started_at))
    .slice(0, LIMIT);
}

function findMePuuid(matches) {
  for (const m of matches) {
    const me = (m.players ?? []).find(
      (p) => String(p.name ?? '').toLowerCase() === NAME.toLowerCase() && String(p.tag ?? '').toUpperCase() === TAG.toUpperCase(),
    );
    if (me?.puuid) return me.puuid;
  }
  for (const m of matches) {
    const me = (m.players ?? []).find((p) => String(p.name ?? '').toLowerCase() === NAME.toLowerCase());
    if (me?.puuid) return me.puuid;
  }
  throw new Error(`No se encontró el puuid de ${NAME}#${TAG} en el archivo`);
}

function mapHenrikToRiotDto(m, myPuuid, mapsByUuid) {
  const meta = m.metadata ?? {};
  const players = m.players ?? [];
  const teams = m.teams ?? [];
  const rounds = m.rounds ?? [];
  const kills = m.kills ?? [];
  const teamsById = new Map(teams.map((t) => [t.team_id, t]));
  const myTeam = players.find((p) => p.puuid === myPuuid)?.team_id ?? null;
  const myTeamInfo = teamsById.get(myTeam);
  const totalRounds = Math.max(
    1,
    teams.reduce((acc, t) => Math.max(acc, (t.rounds?.won ?? 0) + (t.rounds?.lost ?? 0)), 0),
  );

  const enemyPuuids = players.filter((p) => p.team_id !== myTeam).map((p) => p.puuid);
  const gameStart = Date.parse(meta.started_at) || Date.now();
  const roundResultByN = new Map();
  for (let i = 0; i < totalRounds; i++) {
    const r = rounds[i] ?? {};
    roundResultByN.set(i, r);
  }

  const roundResults = [];
  for (let i = 0; i < totalRounds; i++) {
    const r = roundResultByN.get(i) ?? {};
    const playerStats = players.map((p, pIdx) => {
      const st = p.stats ?? {};
      const dealt = st.damage?.dealt ?? 0;
      const hs = st.headshots ?? 0;
      const body = st.bodyshots ?? 0;
      const leg = st.legshots ?? 0;
      const dmg = splitTotal(dealt, totalRounds, i);
      const h = splitTotal(hs, totalRounds, i);
      const b = splitTotal(body, totalRounds, i);
      const l = splitTotal(leg, totalRounds, i);
      const receiver = enemyPuuids.length ? enemyPuuids[(i + pIdx) % enemyPuuids.length] : undefined;
      const roundKills = kills
        .filter((k) => (k.round ?? 0) === i)
        .filter((k) => k.killer?.puuid === p.puuid)
        .map((k) => ({
          timeSinceGameStartMillis: 0,
          timeSinceRoundStartMillis: 0,
          killer: k.killer?.puuid,
          victim: k.victim?.puuid,
          victims: k.victim?.puuid ? [k.victim.puuid] : [],
          assistants: (k.assistants ?? []).map((a) => a.puuid).filter(Boolean),
          finishingDamage: {
            damageType: k.weapon?.type === 'Ability' ? 'Ability' : 'Weapon',
            damageItem: k.weapon?.id ?? '',
            isSecondaryFireMode: false,
          },
        }));
      const spentTotal = p.economy?.spent?.overall ?? 0;
      const loadoutAvg = p.economy?.loadout_value?.average ?? 0;
      return {
        puuid: p.puuid,
        kills: roundKills,
        damage: dealt || hs || body || leg
          ? [{ receiver, damage: dmg, headshots: h, bodyshots: b, legshots: l }]
          : [],
        score: 0,
        economy: {
          loadoutValue: Math.round(loadoutAvg),
          weapon: '',
          armor: '',
          remaining: 0,
          spent: splitTotal(spentTotal, totalRounds, i),
        },
        ability: { grenadeEffects: null, ability1Effects: null, ability2Effects: null, ultimateEffects: null },
        wasAfk: (p.behavior?.afk_rounds ?? 0) > 0 && i === 0,
        wasPenalized: false,
      };
    });
    const plant = r.plant ?? null;
    const defuse = r.defuse ?? null;
    roundResults.push({
      roundNum: i + 1,
      roundResult: r.result ?? '',
      roundCeremony: '',
      winningTeam: r.winning_team ?? (myTeamInfo?.won ? myTeam : undefined),
      bombPlanter: plant?.player?.puuid ?? '',
      bombDefuser: defuse?.player?.puuid ?? '',
      plantRoundTime: 0,
      plantSite: plant?.site ?? '',
      defuseRoundTime: 0,
      playerStats,
      roundResultCode: '',
    });
  }

  return {
    matchInfo: {
      matchId: meta.match_id,
      // Producción usa el path del mapa (`/Game/Maps/...`): se resuelve desde
      // valorant-api para que el fixture tenga exactamente esa forma.
      mapId: mapsByUuid[String(meta.map?.id ?? '').toLowerCase()] ?? meta.map?.id,
      gameVersion: meta.game_version,
      gameLengthMillis: meta.game_length_in_ms ?? 0,
      gameStartMillis: gameStart,
      provisioningFlowID: 'Matchmaking',
      isCompleted: true,
      queueID: meta.queue?.id ?? 'competitive',
      gameMode: meta.queue?.mode_type ?? 'Standard',
      isRanked: true,
    },
    players: players.map((p) => ({
      puuid: p.puuid,
      gameName: p.name ?? '',
      tagLine: p.tag ?? '',
      teamId: p.team_id,
      partyId: p.party_id,
      characterId: p.agent?.id,
      stats: {
        score: p.stats?.score ?? 0,
        roundsPlayed: totalRounds,
        kills: p.stats?.kills ?? 0,
        deaths: p.stats?.deaths ?? 0,
        assists: p.stats?.assists ?? 0,
        playtimeMillis: meta.game_length_in_ms ?? 0,
        abilityCasts: p.ability_casts
          ? {
              grenadeCasts: p.ability_casts.grenade ?? 0,
              ability1Casts: p.ability_casts.ability1 ?? 0,
              ability2Casts: p.ability_casts.ability2 ?? 0,
              ultimateCasts: p.ability_casts.ultimate ?? 0,
            }
          : null,
      },
      competitiveTier: p.tier?.id ?? 0,
      isObserver: false,
      playerCard: p.customization?.card ?? '',
      playerTitle: p.customization?.title ?? '',
    })),
    coaches: [],
    teams: teams.map((t) => ({
      teamId: t.team_id,
      won: Boolean(t.won),
      roundsPlayed: (t.rounds?.won ?? 0) + (t.rounds?.lost ?? 0),
      roundsWon: t.rounds?.won ?? 0,
      numPoints: 0,
    })),
    roundResults,
  };
}

async function loadMapsByUuid() {
  try {
    const res = await fetch('https://valorant-api.com/v1/maps', { signal: AbortSignal.timeout(15_000) });
    const json = await res.json();
    const out = {};
    for (const m of json.data ?? []) {
      if (m?.uuid && m?.mapUrl) out[String(m.uuid).toLowerCase()] = m.mapUrl;
    }
    return out;
  } catch {
    return {};
  }
}

async function main() {
  if (!fs.existsSync(archiveDir)) {
    throw new Error(`No existe el archivo: ${archiveDir}`);
  }
  const mapsByUuid = await loadMapsByUuid();
  const matches = loadMatches();
  if (!matches.length) throw new Error('Sin partidas competitivas completas en el archivo');
  const myPuuid = findMePuuid(matches);

  const fixtures = {};
  const history = [];
  for (const m of matches) {
    const dto = mapHenrikToRiotDto(m, myPuuid, mapsByUuid);
    fixtures[dto.matchInfo.matchId] = dto;
    const me = m.players.find((p) => p.puuid === myPuuid);
    history.push({
      matchId: dto.matchInfo.matchId,
      gameStartTimeMillis: dto.matchInfo.gameStartMillis,
      teamId: me?.team_id ?? history[history.length - 1]?.teamId ?? 'Blue',
    });
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'fixtures.json'), JSON.stringify(fixtures), 'utf8');
  fs.writeFileSync(path.join(outDir, 'matchlist.json'), JSON.stringify({ puuid: myPuuid, history }, null, 0), 'utf8');

  const size = fs.statSync(path.join(outDir, 'fixtures.json')).size;
  console.log(`OK ${Object.keys(fixtures).length} partidas -> ${path.relative(process.cwd(), outDir)}/fixtures.json (${round1(size / 1024)} KB)`);
  console.log(`puuid=${myPuuid}`);
  console.log(`rango: ${new Date(history[history.length - 1].gameStartTimeMillis).toISOString()} .. ${new Date(history[0].gameStartTimeMillis).toISOString()}`);
}

main();
