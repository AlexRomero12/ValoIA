'use client';

import Link from 'next/link';


interface TopBarProps {
  accent: 'red' | 'blue';
  title: string;
  subtitle: [string, string];
  chip: React.ReactNode;
  updated?: string | null;
  onRefresh: () => void;
  loading?: boolean;
  disabled?: boolean;
  activePage: 'aim' | 'ranked';
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
        <button
          className={accent === 'red' ? 'primary-red' : 'primary-blue'}
          onClick={onRefresh}
          disabled={loading || disabled}
          title={disabled ? 'Esperando cooldown para proteger el rate limit' : undefined}
        >
          Actualizar{loading ? <span className="loader" /> : null}
        </button>
      </div>

      <nav className="nav" style={{ ['--accent-nav' as string]: emColor }}>
        <Link href="/" className={activePage === 'aim' ? 'active' : ''}>Aim Lab</Link>
        <Link href="/valorant" className={activePage === 'ranked' ? 'active' : ''}>Ranked</Link>
      </nav>
    </>
  );
}

export function RankChip({ label }: { label: string }) {
  return (
    <span className="chip-red">
      <span>{label}</span>
    </span>
  );
}


