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
        // react-hooks v6 ships the React-Compiler advisory rules at `error`.
        // Two of them fire on patterns this codebase uses legitimately:
        //   - `set-state-in-effect`: SSR mount-guards, debounce hooks, OAuth
        //     callbacks — a setState in an effect is the correct shape there.
        //   - `purity`: `Date.now()` / `new Date()` read during render of an
        //     async Server Component (runs once per request server-side, not
        //     a client-render purity hazard).
        // Keep them as `warn` (visible guidance) rather than blocking. The
        // correctness rules (`rules-of-hooks`, `exhaustive-deps`) and the real
        // anti-pattern `static-components` (component defined during render)
        // stay at `error`.
        'react-hooks/set-state-in-effect': 'warn',
        'react-hooks/purity': 'warn',
      },
    },
    {
      ignores: ['.next/**', 'out/**', 'next-env.d.ts'],
    },
  ]
}
