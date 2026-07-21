import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  // tsconfig.json has `jsx: "preserve"` for Next.js; @vitejs/plugin-react
  // gives vitest its own JSX transform so `.test.tsx` files parse.
  plugins: [react()],
  test: {
    // Unit tests live next to the code they test (co-located). `.test.tsx`
    // covers shared UI components rendered via `react-dom/server`.
    include: [
      'src/features/**/*.test.{ts,tsx}',
      'src/shared/**/*.test.{ts,tsx}',
      'src/i18n/**/*.test.{ts,tsx}',
    ],
    // `*.live.test.ts` hits real third-party APIs (Kimi, etc.) and
    // only runs through the dedicated `test:ai-live` script.
    // Integration tests (testcontainers via @iedora/testing) live in
    // `*.integration.test.ts` and run via `bun run test:integration`.
    exclude: ['node_modules', '.next', 'dist', '**/*.live.test.ts', '**/*.integration.test.ts'],
    environment: 'node',
    pool: 'forks', // PGLite is per-worker; forks isolate cleanly.
    // PGLite WASM init is slow on first hit; give each test a reasonable budget.
    testTimeout: 15_000,
    hookTimeout: 30_000,
    // Co-located tests means setup is per-feature; no global setup needed yet.
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/', import.meta.url)),
    },
  },
})
