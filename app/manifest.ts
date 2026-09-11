import type { MetadataRoute } from 'next';

/**
 * Manifest de la PWA instalable (sin service worker): pantalla completa,
 * tema ink y los iconos generados por scripts/generate-brand-assets.ps1.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ValoIA - Panel de rendimiento Valorant',
    short_name: 'ValoIA',
    description: 'RR, estadísticas por agente y mapa, e impacto de sesión en un panel personal.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0f1923',
    theme_color: '#0f1923',
    lang: 'es',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
