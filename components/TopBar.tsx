'use client';

import Link from 'next/link';
import { UserMenu } from '@/components/auth/UserMenu';
import { MobileNav } from '@/components/MobileNav';


interface TopBarProps {
  accent: 'red' | 'blue';
  title: string;
  subtitle: [string, string];
  chip: React.ReactNode;
  updated?: string | null;
  onRefresh: () => void;
  loading?: boolean;
  disabled?: boolean;
  activePage: 'ranked' | 'comparar' | 'team' | 'tienda' | 'auditoria' | 'perfiles';
}

export function TopBar({ accent, title, subtitle, chip, updated, onRefresh, loading, disabled, activePage }: TopBarProps) {
  const emColor = accent === 'red' ? '#ff4655' : '#35b6ff';
  return (
    <>
      <div className="topbar">
        <div className="brand">
          <h1>
            Valo<em style={{ color: emColor }}>IA</em> <span style={{ fontSize: '0.7em', color: 'var(--mute)' }}>{title}</span>
          </h1>
          <span className="sub">
            {subtitle[0]}
            <br />
            {subtitle[1]}
          </span>
        </div>
        {chip}
        <div className="spacer" />
        {updated ? <span className="updated">{updated}</span> : null}
        <UserMenu />
        <button
          className={accent === 'red' ? 'primary-red' : 'primary-blue'}
          onClick={onRefresh}
          disabled={loading || disabled}
          title={disabled ? 'Esperando cooldown para proteger el rate limit' : 'Actualizar'}
          aria-label="Actualizar"
        >
          <RefreshIcon />
          <span className="btn-label">Actualizar</span>
          {loading ? <span className="loader" /> : null}
        </button>
      </div>

      <nav className="nav" style={{ ['--accent-nav' as string]: emColor }}>
        <Link href="/perfiles" className={activePage === 'perfiles' ? 'active' : ''}>Perfiles</Link>
        <Link href="/valorant" className={activePage === 'ranked' ? 'active' : ''}>Ranked</Link>
        <Link href="/comparativo" className={activePage === 'comparar' ? 'active' : ''}>Comparar</Link>
        <Link href="/team" className={activePage === 'team' ? 'active' : ''}>Team</Link>
        {<Link href="/tienda" className={activePage === 'tienda' ? 'active' : ''}>Tienda</Link>}
        <Link href="/auditoria" className={activePage === 'auditoria' ? 'active' : ''}>Auditoría</Link>
      </nav>

      <MobileNav activePage={activePage} />
    </>
  );
}

function RefreshIcon() {
  return (
    <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 4v4h-4" />
    </svg>
  );
}

export function RankChip({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span className="chip-red" title={title}>
      {children}
    </span>
  );
}


