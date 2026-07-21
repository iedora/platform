import { defineConfig, globalIgnores } from 'eslint/config'
import oxlint from 'eslint-plugin-oxlint'
import { next } from './next.js'
import { vitest } from './vitest.js'

/**
 * Next.js product surface preset. One-line inherit:
 *   export { default } from '@iedora/eslint-config/next-product'
 * A product that also polices cross-slice imports composes this with
 * `boundaries()` (see products/menu/web). oxlint layer stays last (see lib.js).
 */
export default defineConfig([
  ...next(),
  ...vitest(),
  ...oxlint.buildFromOxlintConfig({ categories: { correctness: 'error' } }),
  globalIgnores(['.next/**', 'out/**', 'build/**', 'dist/**', 'next-env.d.ts', 'eslint.config.mjs']),
])
