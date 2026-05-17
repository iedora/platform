import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * Smoke-level vitest config. The genkan suite is tiny — co-located
 * `*.test.ts` next to the use-case under test, with `'server-only'`
 * stripped by the alias so DAL guards can be imported under Node.
 *
 * Path alias mirrors tsconfig.json so `@/...` imports resolve.
 */
// Skip env validation in tests — `@/shared/env` is imported transitively
// by any code that touches the prod DB client; tests wire their own
// PGLite db, so the singleton's connection string is irrelevant. This
// must be set BEFORE Vitest evaluates any test file.
process.env.SKIP_ENV_VALIDATION = '1'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `'server-only'` is a Next-only marker that throws when imported
      // outside an RSC. Map it to a no-op in tests so DAL guards load.
      'server-only': fileURLToPath(
        new URL('./src/shared/testing/server-only-stub.ts', import.meta.url),
      ),
    },
  },
})
