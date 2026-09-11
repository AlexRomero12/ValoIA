import type { Metadata, Viewport } from 'next';
import { Anton, Chakra_Petch } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const anton = Anton({ weight: '400', subsets: ['latin'], variable: '--font-anton', display: 'swap' });
const chakra = Chakra_Petch({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-chakra',
  display: 'swap',
});

const SITE_URL = process.env.DOMAIN ? `https://${process.env.DOMAIN}` : 'https://valoia.duckdns.org';
const SITE_TITLE = 'ValoIA - Panel de rendimiento Valorant';
const SITE_DESC = 'RR, estadísticas por agente y mapa, e impacto de sesión (FB/FD) en un panel personal.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: 'ValoIA',
  title: SITE_TITLE,
  description: SITE_DESC,
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'ValoIA', statusBarStyle: 'black-translucent' },
  icons: {
    icon: ['/icons/icon-192.png', '/icons/icon-512.png'],
    apple: '/icons/apple-touch-icon.png',
  },
  openGraph: {
    type: 'website',
    locale: 'es_CO',
    url: '/',
    siteName: 'ValoIA',
    title: SITE_TITLE,
    description: SITE_DESC,
    images: [{ url: '/og/valoia-og.png', width: 1200, height: 630, alt: SITE_TITLE }],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESC,
    images: ['/og/valoia-og.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: '#0f1923',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${anton.variable} ${chakra.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
