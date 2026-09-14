'use client';

import Link from 'next/link';
import { useT } from '@/lib/i18n/useLocale';

export type NavPage = 'ranked' | 'equipo' | 'reglas' | 'perfiles';

/**
 * Barra HUD inferior para móvil (≤720px): 4 tabs con el activo marcado por el
 * notch angular de la identidad ValoIA.
 */
export function MobileNav({ activePage }: { activePage: NavPage }) {
  const t = useT();
  return (
    <nav className="mobile-nav" aria-label="Secciones">
      <Link href="/valorant" className={activePage === 'ranked' ? 'active' : ''} aria-current={activePage === 'ranked' ? 'page' : undefined}>
        <CrosshairIcon />
        <span>{t('nav.ranked')}</span>
      </Link>
      <Link href="/team" className={activePage === 'equipo' ? 'active' : ''} aria-current={activePage === 'equipo' ? 'page' : undefined}>
        <TeamIcon />
        <span>{t('nav.team')}</span>
      </Link>
      <Link href="/reglas" className={activePage === 'reglas' ? 'active' : ''} aria-current={activePage === 'reglas' ? 'page' : undefined}>
        <ShieldIcon />
        <span>{t('nav.rules')}</span>
      </Link>
      <Link href="/perfiles" className={activePage === 'perfiles' ? 'active' : ''} aria-current={activePage === 'perfiles' ? 'page' : undefined}>
        <UserIcon />
        <span>{t('nav.profile')}</span>
      </Link>
    </nav>
  );
}

function svgProps() {
  return {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
}

function CrosshairIcon() {
  return (
    <svg {...svgProps()}>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TeamIcon() {
  return (
    <svg {...svgProps()}>
      <circle cx="9" cy="9" r="3" />
      <path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5S13.9 16 14.5 19" />
      <circle cx="17" cy="10" r="2.4" />
      <path d="M15.8 14.6c2.4.2 4 1.6 4.7 4.4" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg {...svgProps()}>
      <path d="M12 3l7 3v5c0 4.5-2.8 8-7 10-4.2-2-7-5.5-7-10V6l7-3Z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg {...svgProps()}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20c.8-3.6 3.4-5.4 7-5.4s6.2 1.8 7 5.4" />
    </svg>
  );
}
