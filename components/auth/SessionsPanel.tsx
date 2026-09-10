'use client';

import { useEffect, useState } from 'react';

interface SessionInfo {
  id: string;
  user: string;
  ip: string;
  ua: string;
  createdAt: number;
  lastSeenAt: number;
  current: boolean;
}

/** Resume el user-agent en algo legible (navegador · sistema). */
function describeUa(ua: string): string {
  if (!ua) return 'Dispositivo';
  const os = /Windows/i.test(ua)
    ? 'Windows'
    : /Android/i.test(ua)
      ? 'Android'
      : /iPhone|iPad|iOS/i.test(ua)
        ? 'iOS'
        : /Mac OS/i.test(ua)
          ? 'macOS'
          : /Linux/i.test(ua)
            ? 'Linux'
            : 'Dispositivo';
  const browser = /Edg\//i.test(ua)
    ? 'Edge'
    : /OPR\//i.test(ua)
      ? 'Opera'
      : /Firefox\//i.test(ua)
        ? 'Firefox'
        : /Chrome\//i.test(ua)
          ? 'Chrome'
          : /Safari\//i.test(ua)
            ? 'Safari'
            : 'Navegador';
  return `${browser} · ${os}`;
}

function fmt(ts: number): string {
  return new Date(ts).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * Sesiones activas. `scope`: 'self' (las mías), 'all' (admin) o un username.
 */
export function SessionsPanel({
  scope = 'self',
  admin,
  onPickUser,
}: {
  scope?: string;
  admin: boolean;
  onPickUser?: (user: string) => void;
}) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const qs = scope === 'self' ? '' : `?user=${encodeURIComponent(scope)}`;
        const res = await fetch(`/api/auth/sessions${qs}`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json.error || 'No se pudieron cargar las sesiones');
        if (cancelled) return;
        setSessions(json.sessions ?? []);
        setMsg(null);
      } catch (e) {
        if (!cancelled) setMsg(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoadedFor(scope);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scope, tick]);

  const loading = loadedFor !== scope;

  const revoke = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/sessions?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error || 'No se pudo cerrar');
      }
      setTick((t) => t + 1);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const revokeOthers = async () => {
    if (busy) return;
    const others = sessions.filter((s) => !s.current);
    if (others.length === 0) return;
    if (!window.confirm(`¿Cerrar las otras ${others.length} sesión(es)?`)) return;
    setBusy(true);
    try {
      for (const s of others) {
        await fetch(`/api/auth/sessions?id=${encodeURIComponent(s.id)}`, { method: 'DELETE' });
      }
      setTick((t) => t + 1);
    } finally {
      setBusy(false);
    }
  };

  const showUser = scope !== 'self';

  return (
    <div className="sessions-panel">
      <div className="pf-section-head">
        <span className="window-info">
          {scope === 'self' ? 'Tus dispositivos conectados' : scope === 'all' ? 'Todas las sesiones activas' : `Sesiones de ${scope}`}
        </span>
        {sessions.some((s) => !s.current) ? (
          <button className="f-chip" onClick={() => void revokeOthers()} disabled={busy}>
            Cerrar las demás
          </button>
        ) : null}
      </div>

      {msg ? <div className="banner error" style={{ marginTop: 10 }}>{msg}</div> : null}

      {loading ? (
        <p className="empty" style={{ marginTop: 12 }}>Cargando sesiones…</p>
      ) : sessions.length === 0 ? (
        <p className="empty" style={{ marginTop: 12 }}>Sin sesiones activas.</p>
      ) : (
        <div className="users-list">
          {sessions.map((s) => (
            <div key={s.id} className="user-row">
              <div className="user-row-main">
                {showUser && onPickUser ? (
                  <button className="f-chip" onClick={() => onPickUser(s.user)} title="Ver solo las de este usuario">
                    {s.user}
                  </button>
                ) : showUser ? (
                  <b>{s.user}</b>
                ) : null}
                <b>{describeUa(s.ua)}</b>
                {s.current ? <span className="profile-primary-badge">este dispositivo</span> : null}
                <span className="window-info">IP {s.ip === 'local' ? 'local' : s.ip}</span>
                <span className="window-info">último uso {fmt(s.lastSeenAt)}</span>
                <span className="window-info">desde {fmt(s.createdAt)}</span>
              </div>
              <div className="user-row-actions">
                <button className="f-chip" disabled={busy} onClick={() => void revoke(s.id)}>
                  {s.current ? 'Cerrar' : 'Cerrar sesión'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {scope === 'self' && admin ? (
        <p className="window-info" style={{ marginTop: 10 }}>
          Como admin puedes ver todas desde la pestaña Sesiones eligiendo “Todas”.
        </p>
      ) : null}
    </div>
  );
}
