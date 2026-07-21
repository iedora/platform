import 'server-only'
import { createMenu, createRestaurant, type Restaurant } from '../../../shared/api'

/**
 * Onboarding write: provision the restaurant via the menu API (which
 * owns slug derivation, the plan gate — 422 on over-limit — and
 * auditing), then create one empty menu so the owner lands straight in
 * the menu editor and starts adding their own dishes. Onboarding is a
 * single step now; there's no sample-menu seeding.
 */
export async function createOnboardingRestaurant(input: {
  name: string
  defaultLanguage: string
}): Promise<{ restaurant: Restaurant; menuId: string }> {
  const restaurant = await createRestaurant(input.name, input.defaultLanguage)
  const { id: menuId } = await createMenu(restaurant.slug, 'Menu')
  return { restaurant, menuId }
}
