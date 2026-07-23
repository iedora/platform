import { defineConfig, globalIgnores } from 'eslint/config'
import oxlint from 'eslint-plugin-oxlint'
import { next, boundaries, vitest } from '@iedora/eslint-config'

/**
 * Central-auth surface lint config — composes the shared @iedora/eslint-config
 * factories, mirroring the vantage/house surfaces. A single surface (no vertical
 * slices), so everything under `src/` is surface code.
 */
const eslintConfig = defineConfig([
  ...next(),
  ...boundaries({
    elements: [{ type: 'shared', pattern: 'src/**' }],
  }),
  ...vitest(),
  // oxlint layer LAST — disables the ESLint rules the oxlint correctness
  // pre-pass already runs.
  ...oxlint.buildFromOxlintConfig({ categories: { correctness: 'error' } }),
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'dist/**',
    'next-env.d.ts',
    'eslint.config.mjs',
  ]),
])

export default eslintConfig
