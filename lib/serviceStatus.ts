import { cached } from './cache';
import { env } from './env';
import { HENRIK_CONFIG } from './henrik';

/**
 * Estado de los servidores de Riot (mantenimientos e incidencias).
 *
 * Sirve para dar contexto cuando la API de partidas falla: en vez de un
 * "henrikdev HTTP 500" sin explicación, el dashboard puede decir "Riot en
 * mantenimiento — mostrando histórico".
 *
 * Fuentes (se prueban en orden, la primera disponible manda):
 *  1. Henrik `/valorant/v1/status/{region}` — proxy del in-game status de Riot.
 *  2. Riot oficial VAL-STATUS-V1 `/val/status/v1/platform-data` (si hay RIOT_API_KEY válida).
 *
 * Ambas devuelven el mismo shape (maintenances/incidents con titles/updates),
 * así que un único normalizador cubre las dos. Un fallo de la consulta NO es un
 * error para el llamante: devuelve `ok: false` (estado desconocido).
 */

export type ServiceSource = 'henrik' | 'riot' | 'none';
export type Severity = 'critical' | 'warning' | 'info';

export interface ServiceIncident {
  kind: 'maintenance' | 'incident';
  title: string;
  message: string | null;
  severity: Severity;
  updatedAt: string | null;
}

export interface ServiceStatus {
  source: ServiceSource;
  /** true si se pudo consultar alguna fuente */
  ok: boolean;
  maintenance: boolean;
  incident: boolean;
  /** maintenance || incident: conviene avisar en la UI */
  degraded: boolean;
  incidents: ServiceIncident[];
  fetchedAt: string;
}

const STATUS_TTL_MS = 2 * 60 * 1000;
const STATUS_KEY = 'valo:service-status:v1';

interface LocalizedText {
  locale?: string;
  content?: string;
}

interface RawUpdate {
  translations?: LocalizedText[] | null;
  description?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface RawEntry {
  incident_severity?: string | null;
  maintenance_status?: string | null;
  titles?: LocalizedText[] | null;
  description?: string | null;
  updates?: RawUpdate[] | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/** Primer texto localizado (preferimos en_US; si no, el primero). */
function pickLocalized(list: LocalizedText[] | null | undefined): string | null {
  if (!Array.isArray(list) || list.length === 0) return null;
  const en = list.find((x) => (x?.locale ?? '').toLowerCase().startsWith('en'));
  return (en ?? list[0])?.content ?? null;
}

function toIncident(e: RawEntry, kind: 'maintenance' | 'incident'): ServiceIncident {
  const updates = Array.isArray(e.updates) ? e.updates : [];
  const last = updates[updates.length - 1];
  const message = pickLocalized(last?.translations) ?? last?.description ?? e.description ?? null;
  const raw = (e.incident_severity ?? '').toLowerCase();
  let severity: Severity = raw === 'critical' ? 'critical' : raw === 'warning' ? 'warning' : 'info';
  if (kind === 'maintenance' && (e.maintenance_status ?? '').toLowerCase() === 'in_progress') severity = 'warning';
  const title = pickLocalized(e.titles) ?? (kind === 'maintenance' ? 'Mantenimiento programado' : 'Incidencia');
  const updatedAt = last?.updated_at ?? last?.created_at ?? e.updated_at ?? e.created_at ?? null;
  return { kind, title, message, severity, updatedAt };
}

function normalize(data: unknown, source: ServiceSource): ServiceStatus {
  const d = (data ?? {}) as { maintenances?: RawEntry[]; incidents?: RawEntry[] };
  const maintenances = Array.isArray(d.maintenances) ? d.maintenances : [];
  const incidents = Array.isArray(d.incidents) ? d.incidents : [];
  const list = [
    ...maintenances.map((e) => toIncident(e, 'maintenance')),
    ...incidents.map((e) => toIncident(e, 'incident')),
  ];
  const rank: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  list.sort(
    (a, b) => rank[a.severity] - rank[b.severity] || Date.parse(b.updatedAt ?? '') - Date.parse(a.updatedAt ?? ''),
  );
  return {
    source,
    ok: true,
    maintenance: maintenances.length > 0,
    incident: incidents.length > 0,
    degraded: maintenances.length > 0 || incidents.length > 0,
    incidents: list,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchHenrikStatus(): Promise<ServiceStatus | null> {
  const key = HENRIK_CONFIG.apiKey();
  if (!key) return null;
  try {
    const region = encodeURIComponent(HENRIK_CONFIG.region());
    const res = await fetch(`https://api.henrikdev.xyz/valorant/v1/status/${region}`, {
      headers: { Accept: 'application/json', Authorization: key },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: unknown };
    return normalize(json?.data, 'henrik');
  } catch {
    return null;
  }
}

async function fetchRiotStatus(): Promise<ServiceStatus | null> {
  const key = env('RIOT_API_KEY');
  if (!key) return null;
  // VAL-STATUS-V1 usa platform routing (na, euw, latam…); VAL_STATUS_PLATFORM
  // permite ajustarlo sin tocar el shard de partidas.
  const platform = env('VAL_STATUS_PLATFORM', 'na');
  try {
    const res = await fetch(`https://${platform}.api.riotgames.com/val/status/v1/platform-data`, {
      headers: { Accept: 'application/json', 'X-Riot-Token': key },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return normalize(await res.json(), 'riot');
  } catch {
    return null;
  }
}

/** Estado de Riot (cacheado 2 min). Nunca lanza: `ok:false` = desconocido. */
export function getServiceStatus(): Promise<ServiceStatus> {
  return cached(STATUS_KEY, STATUS_TTL_MS, async () => {
    const henrik = await fetchHenrikStatus();
    if (henrik) return henrik;
    const riot = await fetchRiotStatus();
    if (riot) return riot;
    return {
      source: 'none' as const,
      ok: false,
      maintenance: false,
      incident: false,
      degraded: false,
      incidents: [],
      fetchedAt: new Date().toISOString(),
    };
  });
}
