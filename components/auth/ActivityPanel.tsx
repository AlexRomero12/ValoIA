'use client';

import { useEffect, useState } from 'react';

interface AuthEvent {
  ts: number;
  type: string;
  user?: string;
  ip?: string;
  detail?: string;
}

const TYPE_LABEL: Record<string, string> = {
  login_ok: 'Inicio de sesión',
  login_fail: 'Login fallido',
  login_blocked: 'Login bloqueado',
  logout: 'Cierre de sesión',
  user_create: 'Usuario creado',
  user_delete: 'Usuario borrado',
  password_change: 'Cambio de contraseña',
  sessions_revoke: 'Sesiones cerradas',
  request_access: 'Solicitud de acceso',
  request_approve: 'Solicitud aprobada',
  request_reject: 'Solicitud rechazada',
};

const TYPE_TONE: Record<string, string> = {
  login_ok: 'good',
  login_fail: 'bad',
  login_blocked: 'bad',
  user_delete: 'warn',
  password_change: 'info',
  request_approve: 'good',
  request_reject: 'warn',
};

function fmt(ts: number): string {
  return new Date(ts).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Actividad reciente de auth/admin (solo admin). */
export function ActivityPanel() {
  const [events, setEvents] = useState<AuthEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/auth/log?limit=100', { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json.error || 'No se pudo cargar la actividad');
        if (!cancelled) setEvents(json.events ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  if (!loaded) return <p className="empty" style={{ marginTop: 12 }}>Cargando actividad…</p>;
  if (error) return <div className="banner error" style={{ marginTop: 12 }}>{error}</div>;
  if (events.length === 0) return <p className="empty" style={{ marginTop: 12 }}>Sin eventos todavía.</p>;

  return (
    <div style={{ marginTop: 12 }}>
      <div className="pf-section-head">
        <span className="window-info">Últimos {events.length} eventos</span>
        <button className="f-chip" onClick={() => setTick((t) => t + 1)}>Actualizar</button>
      </div>
      <div className="advice-list">
        {events.map((e, i) => (
          <div key={`${e.ts}-${i}`} className={`advice ${TYPE_TONE[e.type] ?? 'info'}`}>
            <div className="advice-main">
              <b>{TYPE_LABEL[e.type] ?? e.type}</b>
              <span>
                {e.user ? `${e.user}` : 'sistema'}
                {e.ip ? ` · IP ${e.ip}` : ''}
                {e.detail ? ` · ${e.detail}` : ''}
                {` · ${fmt(e.ts)}`}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
