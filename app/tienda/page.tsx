'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TopBar, RankChip } from '@/components/TopBar';
import { StorePanel } from '@/components/store/StorePanel';
import { FavoritesPanel } from '@/components/store/FavoritesPanel';
import { PushPanel } from '@/components/store/PushPanel';
import type { StoreStatusResponse } from '@/app/api/store/status/route';

const POLL_MS = 5 * 60 * 1000;

export default function TiendaPage() {
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const statusQ = useQuery<StoreStatusResponse & { error?: string }>({
    queryKey: ['store-status'],
    queryFn: async () => {
      const res = await fetch('/api/store/status', { cache: 'no-store' });
      const json = (await res.json()) as StoreStatusResponse & { error?: string };
      if (!res.ok || json.error) throw new Error(json.error || 'Error de red');
      return json;
    },
    staleTime: 60_000,
    refetchInterval: POLL_MS,
  });

  const status = statusQ.data;
  const error = (statusQ.error as (Error & { code?: string }) | null) ?? null;
  const loading = statusQ.isLoading;
  const [ssid, setSsid] = useState('');

  const reload = async () => {
    // Fuerza revalidación del storefront en el server y refresca el status.
    await fetch('/api/store/status?refresh=1', { cache: 'no-store' }).catch(() => undefined);
    await qc.invalidateQueries({ queryKey: ['store-status'] });
  };

  const connectCookie = async () => {
    if (!ssid.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/store/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cookie', ssid: ssid.trim() }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok || json.error) throw new Error(json.error || 'No se pudo conectar');
      setSsid('');
      await reload();
    } catch (e) {
      qc.setQueryData(['store-status'], (old: StoreStatusResponse | undefined) => ({
        ...(old ?? ({} as StoreStatusResponse)),
        error: e instanceof Error ? e.message : String(e),
      }));
    } finally {
      setBusy(false);
    }
  };

  const toggleFavorite = async (offerId: string) => {
    if (!status) return;
    const fav = status.favorites.find((f) => f.offerId === offerId);
    const res = await fetch('/api/store/favorites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: fav ? 'remove' : 'add', offerId }),
    });
    if (res.ok) await reload();
  };

  const submitCode = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/store/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'code', code: code.trim() }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok || json.error) throw new Error(json.error || 'No se pudo validar el código');
      setCode('');
      await reload();
    } catch (e) {
      qc.setQueryData(['store-status'], (old: StoreStatusResponse | undefined) => ({
        ...(old ?? ({} as StoreStatusResponse)),
        error: e instanceof Error ? e.message : String(e),
      }));
    } finally {
      setBusy(false);
    }
  };

  const updated = status ? `actualizado ${new Date(status.fetchedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}` : null;
  const chipLabel = loading ? 'Cargando…' : status ? `Tienda · ${status.sourceDetail}` : 'Tienda —';
  const needsCode = !!status?.rso.needsCode;

  return (
    <div className="wrap">
      <TopBar
        accent="red"
        title="Tienda"
        subtitle={['Store', 'Watchlist']}
        chip={<RankChip>{chipLabel}</RankChip>}
        updated={updated}
        onRefresh={() => void reload()}
        loading={loading}
        disabled={busy}
        activePage="tienda"
      />

      {error ? <div className="banner error">{error instanceof Error ? error.message : String(error)}</div> : null}
      {status?.error ? <div className="banner error">{status.error}</div> : null}

      {status?.push ? <PushPanel status={status.push} onChanged={() => void reload()} /> : null}

      {needsCode ? (
        <div className="banner warn">
          <b>2FA requerido.</b> Riot pide un código de verificación para el respaldo RSO.{' '}
          <span className="rso-code-row">
            <input
              type="text"
              inputMode="numeric"
              placeholder="Código de 6 dígitos"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="fav-input rso-code"
            />
            <button className="primary-red" onClick={submitCode} disabled={busy || !code.trim()}>
              Enviar código{busy ? <span className="loader" /> : null}
            </button>
          </span>
        </div>
      ) : null}

      {status && status.source === 'none' && status.rso.status === 'needs_cookie' ? (
        <div className="banner warn">
          <b>Conecta el respaldo RSO con tu sesión de Riot.</b> Riot ya exige captcha en el login por
          contraseña, así que usamos tu sesión web (sin contraseña):
          <ol className="rso-steps">
            <li>
              Entra a <b>auth.riotgames.com</b> en tu navegador (inicia sesión si te lo pide).
            </li>
            <li>
              Pulsa <b>F12</b> → pestaña <b>Application</b> → <b>Cookies</b> → https://auth.riotgames.com
            </li>
            <li>
              Copia el valor de la cookie <b>ssid</b> y pégalo aquí (se queda guardada en tu servidor y se
              renueva sola).
            </li>
          </ol>
          <span className="rso-code-row">
            <input
              type="password"
              placeholder="Valor de la cookie ssid"
              value={ssid}
              onChange={(e) => setSsid(e.target.value)}
              className="fav-input rso-code"
            />
            <button
              className="primary-red"
              onClick={connectCookie}
              disabled={busy || !ssid.trim()}
            >
              Conectar respaldo{busy ? <span className="loader" /> : null}
            </button>
          </span>
        </div>
      ) : null}

      {status ? (
        <div className="two-col">
          <StorePanel
            daily={status.daily}
            dailyRemainingSec={status.dailyRemainingSec}
            fetchedAt={status.fetchedAt}
            source={status.source}
            sourceDetail={status.sourceDetail}
            bundle={status.bundle}
            favoriteIds={new Set(status.favorites.map((f) => f.offerId))}
            onToggleFavorite={toggleFavorite}
          />
          <div className="col">
            <FavoritesPanel
              favorites={status.favorites}
              onChanged={() => void reload()}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}