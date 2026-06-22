import type { LocalizedText } from "@iedora/contracts";
import { type Kysely, sql } from "kysely";

import type { Variant } from "../domain";
import type { MenuDB } from "../schema";
import { invalid, notFound } from "../errors";
import {
  affectedOrNotFound,
  changedOrNotFound,
  jsonbOrNull,
  returnedOrNotFound,
  textArray,
  uuidArray,
} from "./sqlutil";

// Builder mutations. Parent ownership
// is enforced inside each statement (INSERT … SELECT FROM parent / UPDATE …
// WHERE restaurant_id), so a forged or cross-tenant id mutates zero rows and
// surfaces as notFound. Written as raw SQL for the tenancy-guarded INSERT…SELECT
// and jsonb rewrites.

type DB = Kysely<MenuDB>;

const textOrNull = (v: string) => (v === "" ? null : v);
const variantsParam = (v: Variant[] | null) => (v && v.length > 0 ? v : null);

export interface ItemInput {
  name: string;
  nameI18n: LocalizedText | null;
  description: string;
  descriptionI18n: LocalizedText | null;
  priceCents: number;
  currency: string;
  available: boolean;
  tags: string[];
  variants: Variant[] | null;
}

// --- menus ---

export async function createMenu(db: DB, restaurantId: string, name: string): Promise<string> {
  const r = await sql<{ id: string }>`
    INSERT INTO menus (restaurant_id, name, position)
    SELECT r.id, ${name}, coalesce((SELECT max(position)+1 FROM menus WHERE restaurant_id=r.id), 0)
    FROM restaurants r WHERE r.id = ${restaurantId}
    RETURNING id`.execute(db);
  return returnedOrNotFound(r).id;
}

export async function updateMenu(
  db: DB,
  menuId: string,
  restaurantId: string,
  name: string,
  description: string,
  nameI18n: LocalizedText | null,
  descI18n: LocalizedText | null,
  active: boolean,
): Promise<void> {
  const r = await sql`
    UPDATE menus SET name=${name}, description=${textOrNull(description)},
      name_i18n=${jsonbOrNull(nameI18n)}, description_i18n=${jsonbOrNull(descI18n)},
      active=${active}, updated_at=now()
    WHERE id=${menuId} AND restaurant_id=${restaurantId}`.execute(db);
  affectedOrNotFound(r);
}

export async function deleteMenu(db: DB, menuId: string, restaurantId: string): Promise<void> {
  changedOrNotFound(
    await db
      .deleteFrom("menus")
      .where("id", "=", menuId)
      .where("restaurant_id", "=", restaurantId)
      .executeTakeFirst(),
  );
}

// --- categories ---

export async function createCategory(
  db: DB,
  menuId: string,
  restaurantId: string,
  name: string,
): Promise<string> {
  const r = await sql<{ id: string }>`
    INSERT INTO categories (menu_id, restaurant_id, name, position)
    SELECT m.id, m.restaurant_id, ${name},
      coalesce((SELECT max(position)+1 FROM categories WHERE menu_id=m.id), 0)
    FROM menus m WHERE m.id=${menuId} AND m.restaurant_id=${restaurantId}
    RETURNING id`.execute(db);
  return returnedOrNotFound(r).id;
}

export async function updateCategory(
  db: DB,
  categoryId: string,
  restaurantId: string,
  name: string,
  description: string,
  nameI18n: LocalizedText | null,
  descI18n: LocalizedText | null,
): Promise<void> {
  const r = await sql<{ menu_id: string }>`
    UPDATE categories SET name=${name}, description=${textOrNull(description)},
      name_i18n=${jsonbOrNull(nameI18n)}, description_i18n=${jsonbOrNull(descI18n)}, updated_at=now()
    WHERE id=${categoryId} AND restaurant_id=${restaurantId} RETURNING menu_id`.execute(db);
  returnedOrNotFound(r);
}

export async function deleteCategory(db: DB, categoryId: string, restaurantId: string): Promise<void> {
  changedOrNotFound(
    await db
      .deleteFrom("categories")
      .where("id", "=", categoryId)
      .where("restaurant_id", "=", restaurantId)
      .executeTakeFirst(),
  );
}

// --- items ---

export async function createItem(
  db: DB,
  categoryId: string,
  restaurantId: string,
  inp: ItemInput,
): Promise<string> {
  const r = await sql<{ id: string }>`
    INSERT INTO items (category_id, restaurant_id, name, name_i18n, description, description_i18n,
      price_cents, currency, available, tags, variants, position)
    SELECT c.id, c.restaurant_id, ${inp.name}, ${jsonbOrNull(inp.nameI18n)}, ${textOrNull(inp.description)},
      ${jsonbOrNull(inp.descriptionI18n)}, ${inp.priceCents}, ${inp.currency}, ${inp.available},
      ${textArray(inp.tags)}, ${jsonbOrNull(variantsParam(inp.variants))},
      coalesce((SELECT max(position)+1 FROM items WHERE category_id=c.id), 0)
    FROM categories c WHERE c.id=${categoryId} AND c.restaurant_id=${restaurantId}
    RETURNING id`.execute(db);
  return returnedOrNotFound(r).id;
}

// updateItem replaces an item's fields. replaceVariants distinguishes "leave the
// variants column alone" (false) from "set it to inp.variants — possibly
// clearing it" (true).
export async function updateItem(
  db: DB,
  itemId: string,
  restaurantId: string,
  inp: ItemInput,
  replaceVariants: boolean,
): Promise<void> {
  const r = await sql`
    UPDATE items SET name=${inp.name}, description=${textOrNull(inp.description)},
      name_i18n=${jsonbOrNull(inp.nameI18n)}, description_i18n=${jsonbOrNull(inp.descriptionI18n)},
      price_cents=${inp.priceCents}, currency=${inp.currency}, available=${inp.available},
      tags=${textArray(inp.tags)},
      variants = CASE WHEN ${replaceVariants} THEN ${jsonbOrNull(variantsParam(inp.variants))} ELSE variants END,
      updated_at=now()
    WHERE id=${itemId} AND restaurant_id=${restaurantId}`.execute(db);
  affectedOrNotFound(r);
}

export async function deleteItem(db: DB, itemId: string, restaurantId: string): Promise<void> {
  changedOrNotFound(
    await db
      .deleteFrom("items")
      .where("id", "=", itemId)
      .where("restaurant_id", "=", restaurantId)
      .executeTakeFirst(),
  );
}

// --- reordering ---

// reorder runs a renumber-and-count query: the list must name every live child
// under the parent exactly once (updated == total == len) or nothing commits —
// a stale, foreign, duplicate, or partial list is rejected, never half-applied.
async function reorder(
  db: DB,
  query: ReturnType<typeof sql<{ updated: number; total: number }>>,
  count: number,
): Promise<void> {
  const res = await query.execute(db);
  const { updated, total } = res.rows[0]!;
  if (Number(total) === 0) throw notFound();
  if (Number(updated) !== count || Number(updated) !== Number(total)) {
    throw invalid("orderedIds must list every item under this parent exactly once");
  }
}

export function reorderCategories(
  db: DB,
  menuId: string,
  restaurantId: string,
  orderedIds: string[],
): Promise<void> {
  return reorder(
    db,
    sql<{ updated: number; total: number }>`
      WITH upd AS (
        UPDATE categories c SET position = u.ord - 1, updated_at = now()
        FROM unnest(${uuidArray(orderedIds)}) WITH ORDINALITY AS u(id, ord)
        WHERE c.id = u.id AND c.menu_id = ${menuId} AND c.restaurant_id = ${restaurantId}
        RETURNING 1)
      SELECT (SELECT count(*) FROM upd)::int AS updated,
        (SELECT count(*) FROM categories WHERE menu_id = ${menuId} AND restaurant_id = ${restaurantId})::int AS total`,
    orderedIds.length,
  );
}

export function reorderItems(
  db: DB,
  categoryId: string,
  restaurantId: string,
  orderedIds: string[],
): Promise<void> {
  return reorder(
    db,
    sql<{ updated: number; total: number }>`
      WITH upd AS (
        UPDATE items i SET position = u.ord - 1, updated_at = now()
        FROM unnest(${uuidArray(orderedIds)}) WITH ORDINALITY AS u(id, ord)
        WHERE i.id = u.id AND i.category_id = ${categoryId} AND i.restaurant_id = ${restaurantId}
        RETURNING 1)
      SELECT (SELECT count(*) FROM upd)::int AS updated,
        (SELECT count(*) FROM items WHERE category_id = ${categoryId} AND restaurant_id = ${restaurantId})::int AS total`,
    orderedIds.length,
  );
}
