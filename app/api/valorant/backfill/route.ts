import { NextRequest } from 'next/server';
import { backfillPlayer, type BackfillPlayerOptions } from '@/lib/refresh';
import { getProvider } from '@/lib/valorant';
import { getArchiveStats } from '@/lib/archive';
import { getTeam, isValidPlayer, resolvePlayer, memberAccounts } from '@/lib/team';

export const dynamic = 'force-dynamic';

// Backfills serializados: con key Basic (~30 req/min de Henrik) dos jobs
// paralelos se pisan y terminan en 429. Cada POST encola detrás del anterior.
let backfillQueue: Promise<unknown> = Promise.resolve();

/**
 * Estado del archivo acumulativo por jugador: total archivado, rango temporal
 * y marcador del último backfill (cobertura alcanzada). Sin `player` devuelve
 * los 4 miembros del equipo.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const playerParam = sp.get('player');
  if (!isValidPlayer(playerParam)) {
    return Response.json({ error: `Jugador desconocido: ${playerParam}`, code: 'BAD_PLAYER' }, { status: 400 });
  }
  // Cuenta concreta de un miembro multi-cuenta (para sondeo por cuenta).
  const rawAccount = sp.get('account');
  let account: { name: string; tag: string } | null = null;
  if (rawAccount != null) {
    const accs = memberAccounts(resolvePlayer(playerParam || undefined));
    const idx = Number(rawAccount);
    if (Number.isInteger(idx) && idx >= 0 && idx < accs.length) account = accs[idx];
  }
  const members = playerParam ? [resolvePlayer(playerParam)] : getTeam();
  const players = members.flatMap((m) => {
    const accs = account ? [account] : memberAccounts(m);
    return accs.map((a, i) => ({
      id: i === 0 ? m.id : `${m.id}:${i}`,
      label: i === 0 && !account ? m.label : `${m.label} alt ${i}`,
      name: a.name,
      tag: a.tag,
      archive: getArchiveStats(a.name, a.tag),
    }));
  });
  return Response.json({ provider: getProvider(), players }, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Backfill profundo estilo tracker.gg: pagina el historial competitivo más
 * allá del bucket de 40 y archiva todo para siempre. Fire-and-forget como el
 * refresh; el avance se consulta con GET /api/valorant/backfill.
 *
 * Params:
 *  - player     id del miembro (default: alex)
 *  - mode       'season' (default, cubre la temporada actual) | 'all' (fondo total)
 *  - maxPages   páginas de 10 partidas (default 40, tope 150)
 *  - force      =1 re-ejecuta aunque ya exista un backfill cubierto
 */
export async function POST(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const playerParam = sp.get('player');
  if (!isValidPlayer(playerParam)) {
    return Response.json({ error: `Jugador desconocido: ${playerParam}`, code: 'BAD_PLAYER' }, { status: 400 });
  }
  if (getProvider() !== 'henrik') {
    return Response.json(
      { error: 'El backfill requiere el proveedor Henrik (HENRIK_API_KEY)', code: 'PROVIDER_UNSUPPORTED' },
      { status: 400 },
    );
  }
  const modeRaw = sp.get('mode');
  const mode: BackfillPlayerOptions['mode'] = modeRaw === 'all' ? 'all' : 'season';
  const rawPages = Number(sp.get('maxPages') ?? '');
  const maxPages = Number.isFinite(rawPages) && rawPages >= 1 && rawPages <= 150 ? Math.floor(rawPages) : undefined;
  const force = sp.get('force') === '1';

  // Cuenta concreta de un miembro multi-cuenta.
  let account: { name: string; tag: string } | undefined;
  const rawAccount = sp.get('account');
  if (rawAccount != null) {
    const accs = memberAccounts(resolvePlayer(playerParam || undefined));
    const idx = Number(rawAccount);
    if (Number.isInteger(idx) && idx >= 0 && idx < accs.length) account = accs[idx];
  }

  // Fire-and-forget: tarda minutos con key Basic (throttle ~24 req/min).
  void (backfillQueue = backfillQueue
    .then(() => backfillPlayer(playerParam || undefined, { mode, maxPages, force }, account))
    .then((r) =>
      console.log(
        `[backfill] ${r.name}#${r.tag}: +${r.added} nuevas (${r.total} total) en ${r.pages} páginas — ${r.stoppedBy}${r.error ? `: ${r.error}` : ''}`,
      ),
    )
    .catch((err: unknown) => {
      console.error(`[backfill] ${playerParam ?? 'default'} -> ${err instanceof Error ? err.message : String(err)}`);
    }));

  return Response.json({ started: true, mode, maxPages: maxPages ?? null, force });
}
