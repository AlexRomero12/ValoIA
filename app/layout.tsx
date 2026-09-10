import type { Metadata } from 'next';
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

export const metadata: Metadata = {
  title: 'ValoIA · Dash',
  description: 'Dashboard de rendimiento Valorant',
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
