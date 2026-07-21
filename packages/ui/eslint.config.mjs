import { defineConfig, globalIgnores } from 'eslint/config'
import { base, typescript, react } from '@iedora/eslint-config'

export default defineConfig([
  ...base(),
  ...typescript(),
  ...react(),
  globalIgnores(['dist/**', 'eslint.config.mjs']),
])
