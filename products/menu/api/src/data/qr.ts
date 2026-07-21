import type { Kysely } from "kysely";

import type { MenuDB } from "../schema";
import { normalizeQRCode, validQRCode } from "../qr";

// resolveQRCode returns the slug a bound code points at — the sticker-scan hot
// path: one indexed join, no auth. Returns undefined for unknown/unbound/
// malformed codes (all indistinguishable on purpose).
export async function resolveQRCode(db: Kysely<MenuDB>, code: string): Promise<string | undefined> {
  const norm = normalizeQRCode(code);
  if (!validQRCode(norm)) return undefined; // cheap early exit, same shape as unknown
  const row = await db
    .selectFrom("qr_codes as q")
    .innerJoin("restaurants as r", "r.id", "q.restaurant_id")
    .select("r.slug")
    .where("q.code", "=", norm)
    .executeTakeFirst();
  return row?.slug;
}
