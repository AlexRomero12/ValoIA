'use client';

import Link from 'next/link';
import { UserMenu } from '@/components/auth/UserMenu';
import { MobileNav } from '@/components/MobileNav';
import { useCooldown } from '@/lib/useCooldown';


interface TopBarProps {
  accent: 'red' | 'blue';
  title: string;
  subtitle: [string, string];
  chip: React.ReactNode;
  updated?: string | null;
  onRefresh: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** Motivo a mostrar cuando `disabled` lo apaga por algo que no es cooldown. */
  disabledReason?: string;
  activePage: 'ranked' | 'comparar' | 'team' | 'tienda' | 'auditoria' | 'perfiles';
}

const REFRESH_COOLDOWN_S = 60;

export function TopBar({ accent, title, subtitle, chip, updated, onRefresh, loading, disabled, disabledReason, activePage }: TopBarProps) {
  const emColor = accent === 'red' ? '#ff4655' : '#35b6ff';
  // Anti-spam global: cada actualización bloquea el botón 1 minuto.
  const cd = useCooldown(REFRESH_COOLDOWN_S);
  const locked = cd.locked || loading || disabled;

  const handleRefresh = () => {
    if (locked) return;
    cd.trigger();
    onRefresh();
  };

  const refreshTitle = disabled && disabledReason
    ? disabledReason
    : loading
      ? 'Actualizando…'
      : cd.locked
        ? `Puedes actualizar en ${cd.left}s`
        : 'Actualizar';
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
          onClick={handleRefresh}
          disabled={locked}
          title={refreshTitle}
          aria-label="Actualizar"
        >
          {cd.locked ? <span className="btn-cd">{cd.left}</span> : <RefreshIcon />}
          <span className="btn-label">Actualizar</span>
          {loading ? <span className="loader" /> : null}
        </button>
      </div>

      <nav className="nav" style={{ ['--accent-nav' as string]: emColor }}>
        <Link href="/perfiles" className={activePage === 'perfiles' ? 'active' : ''}>Perfiles</Link>
        <Link href="/valorant" className={activePage === 'ranked' ? 'active' : ''}>Ranked</Link>
        <Link href="/comparativo" className={activePage === 'comparar' ? 'active' : ''}>Comparar</Link>
        <Link href="/team" className={activePage === 'team' ? 'active' : ''}>Team</Link>
        <Link href="/auditoria" className={activePage === 'auditoria' ? 'active' : ''}>Auditoría</Link>
        <Link href="/tienda" className={activePage === 'tienda' ? 'active' : ''}>Tienda</Link>
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


