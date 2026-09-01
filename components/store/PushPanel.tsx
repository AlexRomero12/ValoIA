'use client';

import { useState } from 'react';

export interface PushStatus {
  enabled: boolean;
  publicKey: string;
  subscribed: boolean;
  count: number;
}

function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64Url = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64Url);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr.buffer as ArrayBuffer;
}

export function PushPanel({ status, onChanged }: { status: PushStatus; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const supported =
    typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

  if (!status.enabled) {
    return (
      <div className="panel">
        <h2>Notificaciones</h2>
        <p className="empty">Web Push no configurado en el servidor (faltan VAPID keys en .env).</p>
      </div>
    );
  }

  const enable = async () => {
    if (!supported) {
      setError('Tu navegador no soporta notificaciones push');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(status.publicKey),
        });
      }
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string })?.error || 'No se pudo suscribir');
      }
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    setError(null);
    setTestResult(null);
    try {
      const res = await fetch('/api/push/test', { method: 'POST' });
      const json = (await res.json()) as { sent?: number; failed?: number; error?: string };
      if (!res.ok) throw new Error(json.error || 'No se pudo enviar');
      setTestResult(`Enviada a ${json.sent} dispositivo(s)${json.failed ? ` · ${json.failed} fallidos` : ''}. Si no la ves, revisa las notificaciones de Windows para este navegador.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`, { method: 'DELETE' });
        await sub.unsubscribe();
      }
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <h2>Notificaciones</h2>
      {status.subscribed ? (
        <div className="push-row">
          <span className="push-state ok">Activadas en {status.count} dispositivo{status.count === 1 ? '' : 's'}</span>
          <div className="push-actions">
            <button className="f-chip" onClick={sendTest} disabled={busy}>
              Enviar prueba
            </button>
            <button className="f-chip" onClick={disable} disabled={busy}>
              Desactivar
            </button>
          </div>
        </div>
      ) : (
        <div className="push-row">
          <span className="push-state">
            Te avisamos cuando una favorita aparezca en la tienda (aunque la pestaña esté cerrada).
          </span>
          <button className="primary-red" onClick={enable} disabled={busy}>
            Activar notificaciones{busy ? <span className="loader" /> : null}
          </button>
        </div>
      )}
      {testResult ? <p className="push-test-ok">{testResult}</p> : null}
      {error ? <p className="banner error">{error}</p> : null}
    </div>
  );
}