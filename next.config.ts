import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  async redirects() {
    return [
      // Rename de la sección: rutas viejas siguen funcionando un tiempo.
      { source: '/auditoria', destination: '/reglas', permanent: false },
      { source: '/api/valorant/audit-history', destination: '/api/valorant/rules-history', permanent: false },
      // Comparar pasó a ser una tab del hub Equipo.
      { source: '/comparativo', destination: '/team?tab=comparar', permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
