'use client';

import Link from 'next/link';
import { LocaleSwitch, useT } from '@/lib/i18n/useLocale';

export function Landing() {
  const t = useT();
  const features = [1, 2, 3, 4] as const;
  return (
    <div className="wrap" style={{ maxWidth: 980, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 0' }}>
        <b style={{ fontSize: 24 }}>
          Valo<em style={{ color: '#ff4655', fontStyle: 'normal' }}>IA</em>
        </b>
        <LocaleSwitch />
      </header>

      <section className="panel" style={{ padding: '28px 24px' }}>
        <span className="f-chip">{t('landing.badge')}</span>
        <h2 style={{ fontSize: '2rem', margin: '12px 0 6px' }}>{t('landing.title')}</h2>
        <p className="window-info" style={{ maxWidth: 660, fontSize: 15 }}>
          {t('landing.subtitle')}
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          <Link className="primary-red" href="/login?tab=register" style={{ textDecoration: 'none' }}>
            {t('landing.cta')}
          </Link>
          <Link className="f-chip" href="/login" style={{ textDecoration: 'none' }}>
            {t('landing.ctaLogin')}
          </Link>
        </div>
      </section>

      <section
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          marginTop: 16,
        }}
      >
        {features.map((n) => (
          <article key={n} className="panel" style={{ padding: '16px 18px' }}>
            <h3 style={{ margin: '0 0 6px' }}>{t(`landing.f${n}.title`)}</h3>
            <p className="window-info" style={{ margin: 0 }}>
              {t(`landing.f${n}.body`)}
            </p>
          </article>
        ))}
      </section>

      <p className="banner warn" style={{ marginTop: 16 }}>
        {t('landing.optin')}
      </p>

      <footer style={{ margin: '24px 0', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span className="window-info" style={{ maxWidth: 560 }}>
          {t('landing.notAffiliated')}
        </span>
        <span style={{ display: 'flex', gap: 10 }}>
          <Link className="f-chip" href="/terms" style={{ textDecoration: 'none' }}>
            {t('legal.terms')}
          </Link>
          <Link className="f-chip" href="/privacy" style={{ textDecoration: 'none' }}>
            {t('legal.privacy')}
          </Link>
        </span>
      </footer>
    </div>
  );
}
