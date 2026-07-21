import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

/**
 * Next.js-specific config: core-web-vitals + TypeScript rules. Used by the
 * Next.js product (menu). The TS plugin chain inside
 * eslint-config-next sets up the parser, so consumers don't need to
 * configure parserOptions themselves.
 */
export function next() {
  return [
    ...nextVitals,
    ...nextTs,
    {
      // `eslint-config-next/typescript` enables `no-unused-vars` with
      // its own defaults; re-set it here so `_`-prefix opt-outs and
      // rest-sibling ignores stay consistent with `typescript()`.
      files: ['**/*.{ts,tsx,mts,cts}'],
      rules: {
        '@typescript-eslint/no-unused-vars': [
          'error',
          {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            caughtErrorsIgnorePattern: '^_',
            destructuredArrayIgnorePattern: '^_',
            ignoreRestSiblings: true,
          },
        ],
      },
    },
    {
      ignores: ['.next/**', 'out/**', 'next-env.d.ts'],
    },
  ]
}
