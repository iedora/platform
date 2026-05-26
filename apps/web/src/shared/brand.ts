/**
 * Re-export of `@iedora/brand`. The canonical brand + cross-origin URL
 * surface lives in `packages/brand/`; this shim preserves the `@/shared/brand`
 * import path that the menu shell has used since before the package
 * carve-out. Prefer importing directly from `@iedora/brand` in new code.
 */
export * from '@iedora/brand'
