import { defineConfig, globalIgnores } from 'eslint/config'
import oxlint from 'eslint-plugin-oxlint'
import { base } from './base.js'
import { typescript } from './typescript.js'

/**
 * Backend + non-React library preset. Consumers inherit in one line:
 *   export { default } from '@iedora/eslint-config/lib'
 * The oxlint layer is LAST — it turns off the ESLint rules the `oxlint`
 * correctness pre-pass already runs (see root .oxlintrc.json), so the two
 * linters never double-report. Order matters: oxlint must follow the configs
 * that enable those rules.
 */
export default defineConfig([
  ...base(),
  ...typescript(),
  ...oxlint.buildFromOxlintConfig({ categories: { correctness: 'error' } }),
  globalIgnores(['dist/**', 'build/**', 'coverage/**', 'eslint.config.mjs']),
])
