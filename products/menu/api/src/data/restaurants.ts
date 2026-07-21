import type { LocalizedText, Theme } from "@iedora/contracts";
import type { Kysely, Selectable } from "kysely";

import type { Restaurant } from "../domain";
import type { MenuDB } from "../schema";
import type { Restaurants } from "../db.generated";
import { parseJson } from "./sqlutil";

// Restaurant reads shared by the public path and (Stage B) the scoping
// middleware. Mutations live in data/restaurants.write.ts (Stage B).

export const RESTAURANT_COLS = [
  "id",
  "tenant_id",
  "name",
  "slug",
  "description",
  "description_i18n",
  "logo_url",
  "banner_url",
  "theme",
  "default_language",
  "supported_languages",
  "default_currency",
  "onboarding_completed_at",
  "updated_at",
] as const;

type RestaurantRow = Pick<Selectable<Restaurants>, (typeof RESTAURANT_COLS)[number]>;

export function toRestaurant(r: RestaurantRow): Restaurant {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    slug: r.slug,
    description: r.description ?? "",
    descriptionI18n: parseJson<LocalizedText>(r.description_i18n),
    logoUrl: r.logo_url ?? "",
    bannerUrl: r.banner_url ?? "",
    theme: parseJson<Theme>(r.theme),
    defaultLanguage: r.default_language,
    supportedLanguages: r.supported_languages,
    defaultCurrency: r.default_currency,
    onboardingCompletedAt: r.onboarding_completed_at ? new Date(r.onboarding_completed_at) : null,
    updatedAt: new Date(r.updated_at),
  };
}

// Single-column lookup without tenant scoping (callers that need tenancy enforce
// it themselves). Returns undefined when no row matches.
function restaurantBy(
  db: Kysely<MenuDB>,
  col: "slug" | "id",
  value: string,
): Promise<Restaurant | undefined> {
  return db
    .selectFrom("restaurants")
    .select([...RESTAURANT_COLS])
    .where(col, "=", value)
    .executeTakeFirst()
    .then((row) => (row ? toRestaurant(row) : undefined));
}

// By slug — the public read path + the scoping middleware (which enforces
// tenancy itself) share it.
export function restaurantBySlug(db: Kysely<MenuDB>, slug: string): Promise<Restaurant | undefined> {
  return restaurantBy(db, "slug", slug);
}

// By id — the staff admin surface addresses restaurants cross-tenant by id (a
// malformed-uuid lookup raises, so callers 404 on undefined).
export function restaurantById(db: Kysely<MenuDB>, id: string): Promise<Restaurant | undefined> {
  return restaurantBy(db, "id", id);
}
