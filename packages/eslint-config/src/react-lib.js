import { defineConfig, globalIgnores } from 'eslint/config'
import oxlint from 'eslint-plugin-oxlint'
import { base } from './base.js'
import { typescript } from './typescript.js'
import { react } from './react.js'

/**
 * React component-library preset (design system). One-line inherit:
 *   export { default } from '@iedora/eslint-config/react-lib'
 * oxlint layer stays last (see lib.js).
 */
export default defineConfig([
  ...base(),
  ...typescript(),
  ...react(),
  ...oxlint.buildFromOxlintConfig({ categories: { correctness: 'error' } }),
  globalIgnores(['dist/**', 'build/**', 'coverage/**', 'eslint.config.mjs']),
])
