import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const here = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  // Standalone output → minimal server.js bundle for Docker.
  output: 'standalone',
  // Bun workspaces monorepo: trace files up to the workspace root (two
  // levels above this file). Without this Next emits a warning and
  // traces only inside apps/web/, missing the per-product packages.
  outputFileTracingRoot: path.join(here, '..', '..'),
  transpilePackages: [
    '@iedora/design-system',
    '@iedora/observability',
    '@iedora/product-menu',
  ],
  // Version skew protection — forces hard navigation when the client
  // holds assets from a previous deployment. Passed as
  // DEPLOYMENT_VERSION build-arg from CI (typically commit SHA).
  deploymentId: process.env.DEPLOYMENT_VERSION,
  allowedDevOrigins: ['menu.733113.xyz'],
  // Marketing landing photography is served from Unsplash's CDN.
  // Explicit object form (omitting `search` so any query string matches);
  // the `new URL()` shorthand does not reliably register the host on Next 16.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
    ],
    // Cap the optimizer's work on a single self-hosted box: one quality level
    // (Next 16 requires `qualities` to be declared) and WebP only — fewer
    // variants to encode (CPU) and store (disk cache).
    qualities: [75],
    formats: ['image/webp'],
    minimumCacheTTL: 31536000, // 1y — logos/marketing photography rarely change
  },
  // Self-hosted single node: shed Next's in-memory ISR page cache (~50MB) and
  // lean on the persistent on-disk cache instead.
  cacheMaxMemorySize: 0,
  // Public-menu tracking beacons → menu service. `/track/:slug` is the 1×1
  // view pixel; `/track/:slug/session` is the session-end beacon (dwell time +
  // viewed dishes). Catch-all so both (and any future beacon) proxy through.
  async rewrites() {
    return [
      {
        source: '/track/:path*',
        destination: `${process.env.MENU_URL ?? 'http://localhost:8184'}/public/track/:path*`,
      },
    ]
  },
}

// next-intl's request config lives with the messages catalogues in
// @iedora/product-menu. apps/web wires it via the relative path.
const withNextIntl = createNextIntlPlugin(
  '../../products/menu/src/i18n/request.ts',
)
export default withNextIntl(nextConfig)
