'use client';

import { useState } from 'react';
import type { StoreStatusResponse } from '@/app/api/store/status/route';

interface StoreConnectProps {
  rso: StoreStatusResponse['rso'];
  account: { name: string; tag: string } | null;
  onConnected: () => void;
}

/**
 * Conexión de la tienda con Riot (Cookie Reauth). Acepta la cabecera cookie
 * completa (recomendada, ~3 semanas) o solo el valor de ssid (~1 semana).
 */
export function StoreConnect({ rso, account, onConnected }: StoreConnectProps) {
  const [open, setOpen] = useState(rso.status === 'needs_cookie');
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const connect = async () => {
    if (busy || !raw.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/store/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cookie', cookies: raw.trim() }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok || json.error) throw new Error(json.error || 'No se pudo conectar');
      setRaw('');
      setMsg({ kind: 'ok', text: 'Tienda conectada ✓' });
      setOpen(false);
      onConnected();
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const connected = rso.status === 'ok';
  const fmtDate = (ts: number | null): string | null =>
    ts ? new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'short' }) : null;
  const connectedAt = fmtDate(rso.connectedAt);
  const estimateAt = fmtDate(rso.estimateExpiresAt);

  return (
    <div className="panel store-connect">
      <div className="store-connect-head">
        <h2 style={{ margin: 0 }}>Conexión con Riot</h2>
        {connected ? (
          <span className="store-connect-badge ok">
            Conectada{account ? ` · ${account.name}${account.tag ? `#${account.tag}` : ''}` : ''}
          </span>
        ) : (
          <span className="store-connect-badge warn">Sin conexión</span>
        )}
        {connected ? (
          <button className="f-chip" onClick={() => setOpen((v) => !v)}>
            {open ? 'Ocultar' : 'Reconectar'}
          </button>
        ) : null}
      </div>

      {connected ? (
        <p className="window-info" style={{ marginTop: 8 }}>
          {connectedAt ? `Conectada desde el ${connectedAt}. ` : ''}
          {estimateAt ? `Caducidad estimada ~${estimateAt} (Riot no la expone: es una estimación). ` : ''}
          Tus cookies viven solo en tu servidor y nunca se comparten.
        </p>
      ) : null}

      {connected && rso.expiringSoon ? (
        <div className="banner warn" style={{ marginTop: 10 }}>
          La sesión de tienda puede caducar pronto. Reconéctala para no perder los avisos de favoritas.
        </div>
      ) : null}

      {open || !connected ? (
        <div className="store-connect-body">
          <ol className="rso-steps">
            <li>
              Entra a <b>authenticate.riotgames.com</b> e inicia sesión (si ya tienes sesión activa, te
              redirige solo).
            </li>
            <li>
              Pulsa <b>F12</b> → pestaña <b>Network</b> → recarga y haz click en cualquier petición a{' '}
              <b>auth.riotgames.com</b>.
            </li>
            <li>
              En <b>Request Headers</b>, copia el valor completo de la cabecera <b>cookie</b> (recomendado: dura
              ~3 semanas). También sirve solo el valor de la cookie <b>ssid</b> (~1 semana).
            </li>
          </ol>
          <div className="store-connect-row">
            <button
              className="f-chip"
              onClick={() => window.open('https://authenticate.riotgames.com/', '_blank', 'noopener')}
            >
              Abrir authenticate.riotgames.com ↗
            </button>
            <span className="window-info">Se guarda en tu servidor; nunca pasa por terceros.</span>
          </div>
          <textarea
            className="fav-input rso-cookies"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="tdid=…; asid=…; ssid=…   (o solo el valor de ssid)"
            rows={3}
          />
          {msg ? (
            <div className={`banner ${msg.kind === 'error' ? 'error' : 'warn'}`} style={{ marginTop: 8 }}>
              {msg.text}
            </div>
          ) : null}
          <div className="store-connect-row">
            <button className="primary-red" onClick={() => void connect()} disabled={busy || !raw.trim()}>
              {busy ? 'Conectando…' : 'Conectar tienda'}
              {busy ? <span className="loader" /> : null}
            </button>
          </div>
        </div>
      ) : null}

      {!open && msg?.kind === 'ok' ? (
        <div className="banner warn" style={{ marginTop: 10 }}>{msg.text}</div>
      ) : null}
    </div>
  );
}
