import { describe, expect, it } from 'vitest';
import {
  cookieHeader,
  mergeCookies,
  parseCookieInput,
  sessionEstimate,
  SESSION_DAYS_FULL,
  SESSION_DAYS_SSID_ONLY,
} from './rsoCookies';

describe('parseCookieInput', () => {
  it('acepta el valor suelto de ssid', () => {
    const r = parseCookieInput('abc123def456');
    expect(r).toEqual({ jar: { ssid: 'abc123def456' }, full: false });
  });

  it('acepta la cabecera cookie completa separada por ;', () => {
    const r = parseCookieInput('tdid=x; asid=y; ssid=z; clid=ec1');
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.jar).toEqual({ tdid: 'x', asid: 'y', ssid: 'z', clid: 'ec1' });
    expect(r.full).toBe(true);
  });

  it('acepta saltos de línea y prefijo cookie:', () => {
    const r = parseCookieInput('cookie: tdid=x\nssid=z');
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.jar).toEqual({ tdid: 'x', ssid: 'z' });
  });

  it('quita comillas alrededor del valor', () => {
    const r = parseCookieInput('ssid="abc"');
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.jar.ssid).toBe('abc');
  });

  it('falla sin ssid o en vacío', () => {
    expect('error' in parseCookieInput('')).toBe(true);
    expect('error' in parseCookieInput('tdid=x; asid=y')).toBe(true);
  });
});

describe('sessionEstimate', () => {
  const now = Date.UTC(2026, 8, 13);
  const day = 86_400_000;

  it('estima ~3 semanas con jar completo y ~1 con solo ssid', () => {
    const full = sessionEstimate(now, true, now);
    const ssid = sessionEstimate(now, false, now);
    expect(full.estimateExpiresAt - now).toBe(SESSION_DAYS_FULL * day);
    expect(ssid.estimateExpiresAt - now).toBe(SESSION_DAYS_SSID_ONLY * day);
    expect(full.expiringSoon).toBe(false);
  });

  it('marca expiringSoon en los últimos días', () => {
    const almost = sessionEstimate(now - (SESSION_DAYS_SSID_ONLY - 1) * day, false, now);
    expect(almost.expiringSoon).toBe(true);
  });
});

describe('mergeCookies', () => {
  it('actualiza las existentes y añade las nuevas', () => {
    const next = mergeCookies(
      { ssid: 'old', tdid: 'keep' },
      ['ssid=new; Path=/; HttpOnly', 'asid=fresh; Path=/', 'malformed'],
    );
    expect(next).toEqual({ ssid: 'new', tdid: 'keep', asid: 'fresh' });
  });
});

describe('cookieHeader', () => {
  it('genera la cabecera en el formato de Cookie', () => {
    expect(cookieHeader({ a: '1', b: '2' })).toBe('a=1; b=2');
  });
});
