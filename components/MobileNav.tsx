import Link from 'next/link';

export type NavPage = 'ranked' | 'comparar' | 'team' | 'tienda' | 'auditoria' | 'perfiles';

/**
 * Barra HUD inferior para móvil (≤720px): 5 tabs con el activo marcado por el
 * notch angular de la identidad ValoIA. Perfiles queda en el UserMenu.
 */
export function MobileNav({ activePage }: { activePage: NavPage }) {
  return (
    <nav className="mobile-nav" aria-label="Secciones">
      <Link href="/valorant" className={activePage === 'ranked' ? 'active' : ''} aria-current={activePage === 'ranked' ? 'page' : undefined}>
        <CrosshairIcon />
        <span>Ranked</span>
      </Link>
      <Link href="/comparativo" className={activePage === 'comparar' ? 'active' : ''} aria-current={activePage === 'comparar' ? 'page' : undefined}>
        <BarsIcon />
        <span>Comparar</span>
      </Link>
      <Link href="/team" className={activePage === 'team' ? 'active' : ''} aria-current={activePage === 'team' ? 'page' : undefined}>
        <TeamIcon />
        <span>Team</span>
      </Link>
      <Link href="/tienda" className={activePage === 'tienda' ? 'active' : ''} aria-current={activePage === 'tienda' ? 'page' : undefined}>
        <BagIcon />
        <span>Tienda</span>
      </Link>
      <Link href="/auditoria" className={activePage === 'auditoria' ? 'active' : ''} aria-current={activePage === 'auditoria' ? 'page' : undefined}>
        <ShieldIcon />
        <span>Auditoría</span>
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

function BarsIcon() {
  return (
    <svg {...svgProps()}>
      <path d="M5 20v-6M12 20V5M19 20v-9" />
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

function BagIcon() {
  return (
    <svg {...svgProps()}>
      <path d="M5 8h14l-1 12H6L5 8Z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
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
