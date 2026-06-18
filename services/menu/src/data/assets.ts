import { type Kysely, sql } from "kysely";

import type { MenuDB } from "../schema";
import { invalid, notFound } from "../errors";

type DB = Kysely<MenuDB>;

// Asset-column registry: upload target → the restaurants column it lands in.
const ASSET_COLUMNS: Record<string, string> = {
  "restaurant-logo": "logo_url",
  "restaurant-banner": "banner_url",
};

// setRestaurantAsset writes (or clears, with "") an asset URL and returns the
// previous value so the caller can delete the orphaned object. Ports Go
// Store.SetRestaurantAsset.
export async function setRestaurantAsset(
  db: DB,
  id: string,
  target: string,
  url: string,
): Promise<string> {
  const col = ASSET_COLUMNS[target];
  if (!col) throw invalid(`unknown asset target ${target}`);
  const c = sql.ref(col);
  const r = await sql<{ prev: string }>`
    UPDATE restaurants r SET ${c} = nullif(${url}, ''), updated_at = now()
    FROM (SELECT coalesce(${c}, '') AS prev FROM restaurants WHERE id = ${id}) old
    WHERE r.id = ${id} RETURNING old.prev`.execute(db);
  if (r.rows.length === 0) throw notFound();
  return r.rows[0]!.prev;
}

// setItemImage writes (or clears) an item's photo, returning the previous URL.
export async function setItemImage(
  db: DB,
  itemId: string,
  restaurantId: string,
  url: string,
): Promise<string> {
  const r = await sql<{ prev: string }>`
    UPDATE items i SET image_url = nullif(${url}, ''), updated_at = now()
    FROM (SELECT coalesce(image_url, '') AS prev FROM items WHERE id=${itemId} AND restaurant_id=${restaurantId}) old
    WHERE i.id=${itemId} AND i.restaurant_id=${restaurantId} RETURNING old.prev`.execute(db);
  if (r.rows.length === 0) throw notFound();
  return r.rows[0]!.prev;
}

// itemInRestaurant verifies item ownership without loading the row.
export async function itemInRestaurant(db: DB, itemId: string, restaurantId: string): Promise<void> {
  const r = await sql`SELECT 1 FROM items WHERE id=${itemId} AND restaurant_id=${restaurantId}`.execute(db);
  if (r.rows.length === 0) throw notFound();
}
