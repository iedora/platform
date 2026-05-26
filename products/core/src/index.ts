/**
 * @iedora/product-core — auth + admin product surface.
 *
 * Consumers (apps/web) re-export page modules via the subpath exports
 * declared in package.json (`./sign-in`, `./sign-up`, `./admin`, …).
 * Direct imports of this index are rare — kept as a convenience
 * surface for tests + future programmatic mounting.
 */
export { default as Layout } from './layout'
export { default as Landing } from './page'
