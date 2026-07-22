import { defineConfig, globalIgnores } from 'eslint/config'
import oxlint from 'eslint-plugin-oxlint'
import { next, boundaries, vitest } from '@iedora/eslint-config'

/**
 * House's lint config — composes the shared @iedora/eslint-config factories,
 * mirroring the menu surface. House is a single marketing surface (no vertical
 * slices yet), so the boundaries `elements` list is minimal: everything under
 * `src/` is surface code and `src/i18n/**` is next-infra. Kept structurally
 * identical to menu so the two surfaces stay easy to reconcile.
 */
const eslintConfig = defineConfig([
  ...next(),
  ...boundaries({
    elements: [
      { type: 'shared', pattern: 'src/**' },
      { type: 'next-infra', pattern: 'src/i18n/**' },
    ],
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
