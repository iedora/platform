// Public barrel for the house surface. The apps/web route imports the page +
// lang switch from the dedicated subpath exports (`./house-page`, `./lang-switch`),
// but this barrel re-exports them too so `@iedora/product-house` resolves to the
// surface's building blocks by name.
export { HousePage } from './house-page'
export { LandingLangSwitch } from './lang-switch'
