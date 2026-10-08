import { NextRequest } from 'next/server';
import { getHenrikPremierPlayer, getHenrikAccountByPuuid, henrikAccountKey, type HenrikAccount } from '@/lib/henrik';
import { peek } from '@/lib/cache';
import { listVisibleProfiles } from '@/lib/profiles';
import { memberAccounts } from '@/lib/profileTypes';
import { premierFrom, type PremierNameMap } from '@/lib/premier';
import { resolveProfileAccount } from '@/lib/profileAccount';
import { getProvider } from '@/lib/valorant';

export const dynamic = 'force-dynamic';

/** Tope de resoluciones de nombre por petición (protege la cuota de la key). */
const MAX_NAME_LOOKUPS = 10;

/**
 * Equipo de Premier de una cuenta (v2 de premier, estrenado en v4.10).
 *
 * El payload trae los miembros solo con su `puuid`, así que los nombres se
 * resuelven en dos pasos: primero contra las cuentas ya conocidas por el dash
 * (caché de `/account`, sin coste) y, lo que falte, con
 * `/valorant/v2/by-puuid/account/{puuid}` (cacheado 24 h).
 */
export async function GET(req: NextRequest) {
  const resolved = resolveProfileAccount(req);
  if (!resolved.ok) return Response.json(resolved.body, { status: resolved.status });
  if (getProvider() !== 'henrik') {
    return Response.json(
      { error: 'Premier necesita el proveedor Henrik (HENRIK_API_KEY)', code: 'PROVIDER_UNSUPPORTED' },
      { status: 409 },
    );
  }

  const { name, tag } = resolved.value;
  const names: PremierNameMap = {};
  const known = new Set<string>();

  // Cuentas del dash: su puuid ya está cacheado por el resumen/warmup.
  for (const profile of listVisibleProfiles()) {
    for (const acc of memberAccounts(profile)) {
      const cached = peek<HenrikAccount>(henrikAccountKey(acc.name, acc.tag));
      if (!cached?.puuid) continue;
      known.add(cached.puuid);
      names[cached.puuid] = { name: cached.name ?? acc.name, tag: cached.tag ?? acc.tag };
    }
  }

  try {
    const team = await getHenrikPremierPlayer(name, tag);
    if (!team) {
      return Response.json({ error: `${name}#${tag} no está en un equipo de Premier`, code: 'NO_TEAM' }, { status: 404 });
    }

    const pending: string[] = [];
    for (const m of team.member ?? []) {
      const puuid = m.puuid;
      if (!puuid) continue;
      if (names[puuid]) known.add(puuid);
      else pending.push(puuid);
    }
    for (const puuid of pending.slice(0, MAX_NAME_LOOKUPS)) {
      try {
        const acc = await getHenrikAccountByPuuid(puuid);
        if (acc?.name) names[puuid] = { name: acc.name, tag: acc.tag ?? '' };
      } catch {
        /* best-effort: un puuid sin resolver se muestra sin nombre */
      }
    }

    const premier = premierFrom(team, names, known);
    if (!premier) {
      return Response.json({ error: 'Equipo de Premier sin datos utilizables', code: 'NO_TEAM' }, { status: 404 });
    }
    return Response.json(premier, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const code = (err as { code?: string })?.code ?? 'HTTP';
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message, code }, { status: 500 });
  }
}
