import { type Kysely, sql } from "kysely";

import type { MenuDB } from "../schema";

// promoteDefaultLanguage rotates content when the restaurant's default language
// changes from `from` to `to`: every plain column (which by invariant holds the
// default language) moves into the i18n map under `from`, and the `to` override
// — when present — is promoted into the plain column. Runs on the caller's
// transaction so it commits atomically with the identity update.
export async function promoteDefaultLanguage(
  db: Kysely<MenuDB>,
  restaurantId: string,
  from: string,
  to: string,
): Promise<void> {
  // rotate builds the column rewrite for one (plain, i18n) pair:
  //   i18n  := (i18n - to) + {from: plain}
  //   plain := i18n->to ?? plain
  const rotate = (plain: string) => sql`
    ${sql.raw(plain)}_i18n = CASE WHEN ${sql.raw(plain)} IS NULL THEN coalesce(${sql.raw(plain)}_i18n,'{}'::jsonb) - ${to}
      ELSE (coalesce(${sql.raw(plain)}_i18n,'{}'::jsonb) - ${to}) || jsonb_build_object(${from}::text, ${sql.raw(plain)}) END,
    ${sql.raw(plain)} = coalesce(${sql.raw(plain)}_i18n->>${to}, ${sql.raw(plain)})`;

  await sql`UPDATE menus SET ${rotate("name")}, ${rotate("description")} WHERE restaurant_id = ${restaurantId}`.execute(db);
  await sql`UPDATE categories SET ${rotate("name")}, ${rotate("description")} WHERE restaurant_id = ${restaurantId}`.execute(db);
  await sql`UPDATE items SET ${rotate("name")}, ${rotate("description")} WHERE restaurant_id = ${restaurantId}`.execute(db);
  await sql`UPDATE restaurants SET ${rotate("description")} WHERE id = ${restaurantId}`.execute(db);

  // Variant labels live inside a jsonb array: rebuild each element with the same
  // rotation, preserving order.
  await sql`
    UPDATE items SET variants = sub.rotated
    FROM (
      SELECT i.id, jsonb_agg(
        jsonb_set(
          jsonb_set(v, '{labelI18n}',
            CASE WHEN v->>'label' IS NULL THEN coalesce(v->'labelI18n','{}'::jsonb) - ${to}
            ELSE (coalesce(v->'labelI18n','{}'::jsonb) - ${to}) || jsonb_build_object(${from}::text, v->>'label') END),
          '{label}', to_jsonb(coalesce(v->'labelI18n'->>${to}, v->>'label'))
        ) ORDER BY ord) AS rotated
      FROM items i, jsonb_array_elements(i.variants) WITH ORDINALITY AS e(v, ord)
      WHERE i.restaurant_id = ${restaurantId} AND i.variants IS NOT NULL
      GROUP BY i.id
    ) sub
    WHERE items.id = sub.id`.execute(db);
}
