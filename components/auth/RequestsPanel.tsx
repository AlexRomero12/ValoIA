'use client';

import { useEffect, useRef, useState } from 'react';

interface AccessRequest {
  id: string;
  username: string;
  message?: string;
  ip: string;
  ua?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  decidedAt?: number;
  decidedBy?: string;
}

type Msg = { kind: 'ok' | 'error'; text: string } | null;

function fmt(ts: number): string {
  return new Date(ts).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Solicitudes de acceso pendientes y decididas (solo admin). */
export function RequestsPanel({ onPending }: { onPending?: (n: number) => void }) {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState<{ username: string; password: string } | null>(null);
  const [tick, setTick] = useState(0);
  const cbRef = useRef(onPending);
  useEffect(() => {
    cbRef.current = onPending;
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/auth/requests', { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json.error || 'No se pudieron cargar las solicitudes');
        if (cancelled) return;
        setRequests(json.requests ?? []);
        cbRef.current?.(json.pending ?? 0);
      } catch (e) {
        if (!cancelled) setMsg({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const decide = async (id: string, action: 'approve' | 'reject') => {
    if (busy) return;
    if (action === 'reject' && !window.confirm('¿Rechazar esta solicitud?')) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/auth/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'No se pudo procesar');
      if (json.result === 'approved') {
        setGenerated({ username: json.username, password: json.password });
        setMsg({ kind: 'ok', text: `Usuario ${json.username} aprobado con contraseña temporal.` });
      } else {
        setMsg({ kind: 'ok', text: 'Solicitud rechazada.' });
      }
      setTick((t) => t + 1);
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const copyGenerated = async () => {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(`${generated.username} / ${generated.password}`);
      setMsg({ kind: 'ok', text: 'Credenciales copiadas.' });
    } catch {
      setMsg({ kind: 'error', text: 'No se pudo copiar; selecciónalas manualmente.' });
    }
  };

  if (!loaded) return <p className="empty" style={{ marginTop: 12 }}>Cargando solicitudes…</p>;

  const pending = requests.filter((r) => r.status === 'pending');
  const decided = requests.filter((r) => r.status !== 'pending');

  return (
    <div>
      {generated ? (
        <div className="banner warn" style={{ marginTop: 12 }}>
          Comparte estas credenciales (se muestran una sola vez): <b>{generated.username}</b> / <b>{generated.password}</b>{' '}
          <button className="f-chip" style={{ marginLeft: 8 }} onClick={() => void copyGenerated()}>
            Copiar
          </button>
        </div>
      ) : null}
      {msg ? (
        <div className={`banner ${msg.kind === 'error' ? 'error' : 'warn'}`} style={{ marginTop: 12 }}>
          {msg.text}
        </div>
      ) : null}

      {pending.length === 0 ? (
        <p className="empty" style={{ marginTop: 12 }}>No hay solicitudes pendientes.</p>
      ) : (
        <div className="users-list" style={{ marginTop: 12 }}>
          {pending.map((r) => (
            <div key={r.id} className="user-row">
              <div className="user-row-main">
                <b>{r.username}</b>
                <span className="profile-primary-badge">pendiente</span>
                <span className="window-info">IP {r.ip}</span>
                <span className="window-info">{fmt(r.createdAt)}</span>
                {r.message ? <span className="window-info">“{r.message}”</span> : null}
              </div>
              <div className="user-row-actions">
                <button className="primary-red" disabled={busy} onClick={() => void decide(r.id, 'approve')}>
                  Aprobar
                </button>
                <button className="f-chip" disabled={busy} onClick={() => void decide(r.id, 'reject')}>
                  Rechazar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {decided.length > 0 ? (
        <details style={{ marginTop: 16 }}>
          <summary>Historial de solicitudes ({decided.length})</summary>
          <div className="users-list" style={{ marginTop: 10 }}>
            {decided.map((r) => (
              <div key={r.id} className="user-row off">
                <div className="user-row-main">
                  <b>{r.username}</b>
                  <span className={`audit-falta${r.status === 'approved' ? '' : ' bad'}`}>
                    {r.status === 'approved' ? 'aprobada' : 'rechazada'}
                  </span>
                  <span className="window-info">por {r.decidedBy ?? '—'}</span>
                  <span className="window-info">{r.decidedAt ? fmt(r.decidedAt) : ''}</span>
                  <span className="window-info">IP {r.ip}</span>
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
