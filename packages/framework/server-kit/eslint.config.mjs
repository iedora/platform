import { defineConfig, globalIgnores } from 'eslint/config'
import { base, typescript } from '@iedora/eslint-config'

export default defineConfig([
  ...base(),
  ...typescript(),
  globalIgnores(['dist/**', 'eslint.config.mjs']),
])
