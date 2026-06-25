import { getTranslations } from 'next-intl/server'
import { isPlanCode } from '@iedora/product-menu/features/plans'

// The pure presentational primitives moved to ./primitives so the client
// payments panel can share them too; re-exported here for the server pages that
// already import from this module.
export * from './primitives'

/** Resolves plan display names from the i18n `Billing.plans.<code>.name` source —
 * the SAME one the tenant billing page renders — so admin labels can never drift
 * from product copy. Locale-aware (the request locale), with the "free" annotation
 * translated from `Admin.plans.freeSuffix`. Returns a sync labeller the pages call. */
export async function planNamer(): Promise<(code: string | undefined) => string> {
  const [tb, ta] = await Promise.all([getTranslations('Billing'), getTranslations('Admin')])
  return (code) =>
    code && isPlanCode(code)
      ? tb(`plans.${code}.name`)
      : `${tb('plans.menu_free.name')} ${ta('plans.freeSuffix')}`
}
