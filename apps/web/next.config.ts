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
    // Published @iedora/* SDKs ship .ts source, so Turbopack must transpile them.
    '@iedora/sdk/audit',
    '@iedora/auth-sdk',
    '@iedora/auth-sdk/next',
    '@iedora/sdk/email',
    '@iedora/observability',
    '@iedora/product-house',
    '@iedora/product-menu',
    '@iedora/product-tutor',
    '@iedora/ui',
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
  // NOTE: the public-menu view beacon (/track/:slug[/session]) is proxied to the
  // menu service in proxy.ts (runtime), NOT here. next.config rewrites freeze
  // their destination at BUILD time, where MENU_URL is unset — the localhost
  // fallback got baked into the image and every beacon 500'd in prod.
}

// next-intl's request config lives in apps/web so it can MERGE the menu +
// house message catalogs (statically imported from each product package)
// without either package depending on the other.
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')
export default withNextIntl(nextConfig)
