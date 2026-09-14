import { redirect } from 'next/navigation';
import { Landing } from '@/components/public/Landing';
import { isPublicMode } from '@/lib/appMode';

// El modo se lee en cada request: en build no hay APP_MODE y la landing no
// debe hornearse como redirect al dashboard.
export const dynamic = 'force-dynamic';

export default function HomePage() {
  // Instancia personal: directo al dashboard. Producto público: landing.
  if (!isPublicMode()) redirect('/valorant');
  return <Landing />;
}
