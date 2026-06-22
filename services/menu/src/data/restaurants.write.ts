import type { LocalizedText, RestaurantSummary, Theme } from "@iedora/contracts";
import { type Kysely, sql } from "kysely";

import type { Restaurant } from "../domain";
import type { MenuDB } from "../schema";
import { isUniqueViolation, notFound, slugTaken } from "../errors";
import { RESTAURANT_COLS, toRestaurant } from "./restaurants";
import { changedOrNotFound, jsonbOrNull, textArray } from "./sqlutil";

// Wire DTO re-exported so existing importers (service.ts) keep resolving; the
// shape is owned by @iedora/contracts (single source of truth).
export type { RestaurantSummary };

// Restaurant mutations + dashboard aggregates — the write half. Reads + the
// shared column list live in data/restaurants.ts.

type DB = Kysely<MenuDB>;

// createRestaurant inserts a restaurant and returns its id. Throws slugTaken on
// a slug collision so the caller can pick the next candidate.
export async function createRestaurant(
  db: DB,
  r: { tenantId: string; name: string; slug: string; defaultLanguage: string; supportedLanguages: string[] },
): Promise<string> {
  try {
    const res = await sql<{ id: string }>`
      INSERT INTO restaurants (tenant_id, name, slug, default_language, supported_languages)
      VALUES (${r.tenantId}, ${r.name}, ${r.slug}, ${r.defaultLanguage}, ${textArray(r.supportedLanguages)})
      RETURNING id`.execute(db);
    return res.rows[0]!.id;
  } catch (err) {
    if (isUniqueViolation(err)) throw slugTaken();
    throw err;
  }
}

// updateIdentityRow persists the editable identity fields and returns the
// updated row. When promoting (the rotation owns the description columns), the
// UPDATE leaves description untouched rather than clobbering the rotated value.
export async function updateIdentityRow(db: DB, r: Restaurant, promoting: boolean): Promise<Restaurant> {
  if (promoting) {
    await sql`
      UPDATE restaurants SET name=${r.name}, theme=${jsonbOrNull(r.theme)}, default_language=${r.defaultLanguage},
        supported_languages=${textArray(r.supportedLanguages)}, updated_at=now()
      WHERE id=${r.id}`.execute(db);
  } else {
    await sql`
      UPDATE restaurants SET name=${r.name}, description=${r.description === "" ? null : r.description},
        description_i18n=${jsonbOrNull(r.descriptionI18n)}, theme=${jsonbOrNull(r.theme)},
        default_language=${r.defaultLanguage}, supported_languages=${textArray(r.supportedLanguages)}, updated_at=now()
      WHERE id=${r.id}`.execute(db);
  }
  const updated = await db
    .selectFrom("restaurants")
    .select([...RESTAURANT_COLS])
    .where("id", "=", r.id)
    .executeTakeFirst();
  if (!updated) throw notFound();
  return toRestaurant(updated);
}

// renameSlug changes the public URL of a restaurant.
export async function renameSlug(db: DB, id: string, slug: string): Promise<void> {
  try {
    changedOrNotFound(
      await db
        .updateTable("restaurants")
        .set({ slug, updated_at: sql`now()` })
        .where("id", "=", id)
        .executeTakeFirst(),
    );
  } catch (err) {
    if (isUniqueViolation(err)) throw slugTaken();
    throw err;
  }
}

// completeOnboarding stamps the wizard as finished (idempotent).
export async function completeOnboarding(db: DB, id: string): Promise<void> {
  changedOrNotFound(
    await db
      .updateTable("restaurants")
      .set({ onboarding_completed_at: sql`coalesce(onboarding_completed_at, now())` })
      .where("id", "=", id)
      .executeTakeFirst(),
  );
}

// deleteRestaurant removes a restaurant and (via FK cascade) its entire tree.
export async function deleteRestaurant(db: DB, id: string, tenantId: string): Promise<void> {
  changedOrNotFound(
    await db
      .deleteFrom("restaurants")
      .where("id", "=", id)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst(),
  );
}

// countRestaurants counts a tenant's restaurants (plan gate input).
export async function countRestaurants(db: DB, tenantId: string): Promise<number> {
  const r = await sql<{ n: string }>`SELECT count(*)::text AS n FROM restaurants WHERE tenant_id=${tenantId}`.execute(db);
  return Number(r.rows[0]!.n);
}

// --- dashboard aggregates ---

export async function listRestaurantsWithCounts(db: DB, tenantId: string): Promise<RestaurantSummary[]> {
  const rows = await sql<{
    id: string;
    name: string;
    slug: string;
    updated_at: Date;
    menu_count: string;
    dish_count: string;
  }>`
    SELECT r.id, r.name, r.slug, r.updated_at,
      (SELECT count(*) FROM menus m WHERE m.restaurant_id = r.id) AS menu_count,
      (SELECT count(*) FROM items i WHERE i.restaurant_id = r.id) AS dish_count
    FROM restaurants r WHERE r.tenant_id = ${tenantId}
    ORDER BY r.created_at`.execute(db);
  return rows.rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    updatedAt: new Date(r.updated_at).toISOString(),
    menuCount: Number(r.menu_count),
    dishCount: Number(r.dish_count),
  }));
}

export interface MenuSummary {
  id: string;
  name: string;
  active: boolean;
  position: number;
  updatedAt: string;
  categoryCount: number;
  dishCount: number;
}

export async function menusWithCounts(db: DB, restaurantId: string): Promise<MenuSummary[]> {
  const rows = await sql<{
    id: string;
    name: string;
    active: boolean;
    position: number;
    updated_at: Date;
    category_count: string;
    dish_count: string;
  }>`
    SELECT m.id, m.name, m.active, m.position, m.updated_at,
      (SELECT count(*) FROM categories c WHERE c.menu_id = m.id) AS category_count,
      (SELECT count(*) FROM items i JOIN categories c ON i.category_id = c.id WHERE c.menu_id = m.id) AS dish_count
    FROM menus m WHERE m.restaurant_id = ${restaurantId}
    ORDER BY m.position, m.created_at`.execute(db);
  return rows.rows.map((m) => ({
    id: m.id,
    name: m.name,
    active: m.active,
    position: m.position,
    updatedAt: new Date(m.updated_at).toISOString(),
    categoryCount: Number(m.category_count),
    dishCount: Number(m.dish_count),
  }));
}
