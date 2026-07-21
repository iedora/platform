import { defineConfig, globalIgnores } from 'eslint/config'
import { next, vitest } from '@iedora/eslint-config'

export default defineConfig([
  ...next(),
  ...vitest(),
  globalIgnores(['.next/**', 'out/**', 'build/**', 'dist/**', 'next-env.d.ts', 'eslint.config.mjs']),
])
