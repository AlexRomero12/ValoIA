'use client';

import { useSyncExternalStore } from 'react';
import { LOCALES, normalizeLocale, translate, type Locale } from './dict';

export type { Locale };

/**
 * Locale como store externo (cookie `locale`): todos los componentes leen el
 * mismo valor y se re-renderizan al cambiarlo, sin setState en efectos.
 * En SSR se asume `es`.
 */

let currentLocale: Locale = 'es';
let cachedRaw: string | null = null;
const listeners = new Set<() => void>();

function rawCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(/(?:^|;\s*)locale=(es|en)/);
  return m?.[1] ?? null;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): Locale {
  // Sincroniza con la cookie solo cuando cambia (evita lecturas por render).
  const raw = rawCookie();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    currentLocale = normalizeLocale(raw);
  }
  return currentLocale;
}

function getServerSnapshot(): Locale {
  return 'es';
}

/** Locale del cliente (cookie `locale`), con setter que la persiste. */
export function useLocale(): [Locale, (l: Locale) => void] {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const set = (l: Locale) => {
    document.cookie = `locale=${l}; path=/; max-age=31536000; samesite=lax`;
    cachedRaw = l;
    currentLocale = l;
    for (const cb of listeners) cb();
  };
  return [locale, set];
}

/** Traductor atado al locale actual. */
export function useT(): (key: string, vars?: Record<string, string | number>) => string {
  const [locale] = useLocale();
  return (key, vars) => translate(locale, key, vars);
}

/** Selector ES/EN compacto. */
export function LocaleSwitch({ className = 'f-chip' }: { className?: string }) {
  const [locale, setLocale] = useLocale();
  return (
    <span className="locale-switch" style={{ display: 'inline-flex', gap: 4 }}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          className={`${className}${locale === l ? ' player-on' : ''}`}
          onClick={() => setLocale(l)}
          aria-pressed={locale === l}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </span>
  );
}
