import type { LocalizedText } from "@iedora/contracts";
import { type Kysely, sql } from "kysely";

import type { CategoryNode, ItemNode, Node, Snapshot, Variant } from "../domain.ts";
import type { MenuDB } from "../schema.ts";
import { restaurantBySlug } from "./restaurants.ts";
import { parseJson } from "./sqlutil.ts";

// Loads the content hierarchy with three indexed queries (menus, categories,
// items) and assembles it in memory — no N+1, no joins multiplying i18n blobs.

const i18n = (v: unknown): LocalizedText | null => parseJson<LocalizedText>(v);

export async function menuTree(
  db: Kysely<MenuDB>,
  restaurantId: string,
  activeOnly: boolean,
): Promise<Node[]> {
  let menuQ = db
    .selectFrom("menus")
    .select(["id", "name", "name_i18n", "description", "description_i18n", "position", "active"])
    .where("restaurant_id", "=", restaurantId);
  if (activeOnly) menuQ = menuQ.where("active", "=", true);
  const menuRows = await menuQ.orderBy("position").orderBy("created_at").execute();
  if (menuRows.length === 0) return [];

  let catQ = db
    .selectFrom("categories as c")
    .innerJoin("menus as m", "m.id", "c.menu_id")
    .select([
      "c.id",
      "c.menu_id",
      "c.name",
      "c.name_i18n",
      "c.description",
      "c.description_i18n",
      "c.position",
    ])
    .where("c.restaurant_id", "=", restaurantId);
  if (activeOnly) catQ = catQ.where("m.active", "=", true);
  const catRows = await catQ.orderBy("c.position").orderBy("c.created_at").execute();

  let itemQ = db
    .selectFrom("items as i")
    .innerJoin("categories as c", "c.id", "i.category_id")
    .innerJoin("menus as m", "m.id", "c.menu_id")
    .select([
      "i.id",
      "i.category_id",
      "i.name",
      "i.name_i18n",
      "i.description",
      "i.description_i18n",
      "i.price_cents",
      "i.currency",
      "i.image_url",
      "i.position",
      "i.available",
      "i.tags",
      "i.variants",
    ])
    .where("i.restaurant_id", "=", restaurantId);
  if (activeOnly) itemQ = itemQ.where("m.active", "=", true);
  const itemRows = await itemQ.orderBy("i.position").orderBy("i.created_at").execute();

  // Assemble leaf-up; normalize nil slices so JSON never branches.
  const itemsByCategory = new Map<string, ItemNode[]>();
  for (const it of itemRows) {
    const node: ItemNode = {
      id: it.id,
      categoryId: it.category_id,
      name: it.name,
      nameI18n: i18n(it.name_i18n),
      description: it.description ?? "",
      descriptionI18n: i18n(it.description_i18n),
      priceCents: it.price_cents,
      currency: it.currency,
      imageUrl: it.image_url ?? "",
      position: it.position,
      available: it.available,
      tags: it.tags ?? [],
      variants: parseJson<Variant[]>(it.variants) ?? [],
    };
    const arr = itemsByCategory.get(it.category_id);
    if (arr) arr.push(node);
    else itemsByCategory.set(it.category_id, [node]);
  }

  const categoriesByMenu = new Map<string, CategoryNode[]>();
  for (const c of catRows) {
    const node: CategoryNode = {
      id: c.id,
      menuId: c.menu_id,
      name: c.name,
      nameI18n: i18n(c.name_i18n),
      description: c.description ?? "",
      descriptionI18n: i18n(c.description_i18n),
      position: c.position,
      items: itemsByCategory.get(c.id) ?? [],
    };
    const arr = categoriesByMenu.get(c.menu_id);
    if (arr) arr.push(node);
    else categoriesByMenu.set(c.menu_id, [node]);
  }

  return menuRows.map((m) => ({
    id: m.id,
    name: m.name,
    nameI18n: i18n(m.name_i18n),
    description: m.description ?? "",
    descriptionI18n: i18n(m.description_i18n),
    position: m.position,
    active: m.active,
    categories: categoriesByMenu.get(m.id) ?? [],
  }));
}

// snapshotBySlug loads a restaurant and its full tree — the public read path
// (activeOnly=true) and the admin builder (activeOnly=false) share it. Returns
// undefined when the slug is unknown.
export async function snapshotBySlug(
  db: Kysely<MenuDB>,
  slug: string,
  activeOnly: boolean,
): Promise<Snapshot | undefined> {
  const restaurant = await restaurantBySlug(db, slug);
  if (!restaurant) return undefined;
  const menus = await menuTree(db, restaurant.id, activeOnly);
  return { restaurant, menus };
}

// Cheap content version for the public-menu cache: the newest updated_at across
// the restaurant's menu tree, as a sortable string. Backed by the
// (restaurant_id, updated_at DESC) indexes, so it's an index-only one-row probe
// per table — far cheaper than re-reading + localizing the whole tree. Any menu
// write bumps an updated_at, which changes this string and invalidates the cache.
export async function menuContentVersion(db: Kysely<MenuDB>, restaurantId: string): Promise<string> {
  const res = await sql<{ v: string | null }>`
    SELECT to_char(greatest(
      coalesce((SELECT max(updated_at) FROM menus      WHERE restaurant_id = ${restaurantId}), 'epoch'::timestamptz),
      coalesce((SELECT max(updated_at) FROM categories WHERE restaurant_id = ${restaurantId}), 'epoch'::timestamptz),
      coalesce((SELECT max(updated_at) FROM items      WHERE restaurant_id = ${restaurantId}), 'epoch'::timestamptz)
    ), 'YYYYMMDDHH24MISSUS') AS v
  `.execute(db);
  return res.rows[0]?.v ?? "";
}
