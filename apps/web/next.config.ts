import type { NextConfig } from 'next';

/**
 * Le Web ne parle JAMAIS directement à l'API depuis le navigateur avec des
 * secrets : toutes les requêtes passent par des routes serveur Next (`/api/proxy`),
 * qui ajoutent le jeton de session httpOnly. Les clés d'IA restent sur l'API.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
