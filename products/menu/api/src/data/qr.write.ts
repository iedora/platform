import type { RestaurantRef } from "@iedora/contracts";
import { type Kysely, sql } from "kysely";

import type { MenuDB } from "../schema";
import { normalizeQRCode } from "../qr";
import { changedOrNotFound, textArray } from "./sqlutil";

type DB = Kysely<MenuDB>;

// Wire DTO re-exported so existing importers keep resolving; the shape is owned
// by @iedora/contracts (single source of truth).
export type { RestaurantRef };

// QR sticker administration (staff, cross-tenant) — the write half.
// resolveQRCode (the public scan path) lives in data/qr.ts.

export interface QRCode {
  code: string;
  restaurantId?: string;
  restaurantName?: string;
  restaurantSlug?: string;
  label?: string;
  boundAt?: string;
  createdAt: string;
}

// createQRCodes inserts codes (optionally pre-bound). Existing codes are skipped
// (idempotent bulk import); returns the inserted count.
export async function createQRCodes(
  db: DB,
  codes: string[],
  restaurantId: string,
  label: string,
): Promise<number> {
  const bound = restaurantId !== "" ? sql`now()` : sql`NULL`;
  const r = await sql`
    INSERT INTO qr_codes (code, restaurant_id, label, bound_at)
    SELECT unnest(${textArray(codes)}), nullif(${restaurantId}, '')::uuid, nullif(${label}, ''), ${bound}
    ON CONFLICT (code) DO NOTHING`.execute(db);
  return Number(r.numAffectedRows ?? 0n);
}

export async function bindQRCode(db: DB, code: string, restaurantId: string): Promise<void> {
  changedOrNotFound(
    await db
      .updateTable("qr_codes")
      .set({ restaurant_id: restaurantId, bound_at: sql`now()` })
      .where("code", "=", normalizeQRCode(code))
      .executeTakeFirst(),
  );
}

export async function unbindQRCode(db: DB, code: string): Promise<void> {
  changedOrNotFound(
    await db
      .updateTable("qr_codes")
      .set({ restaurant_id: null, bound_at: null })
      .where("code", "=", normalizeQRCode(code))
      .executeTakeFirst(),
  );
}

export async function labelQRCode(db: DB, code: string, label: string): Promise<void> {
  // label || null mirrors the old nullif(label, '') — an empty string clears it.
  changedOrNotFound(
    await db
      .updateTable("qr_codes")
      .set({ label: label || null })
      .where("code", "=", normalizeQRCode(code))
      .executeTakeFirst(),
  );
}

export async function deleteQRCode(db: DB, code: string): Promise<void> {
  changedOrNotFound(
    await db.deleteFrom("qr_codes").where("code", "=", normalizeQRCode(code)).executeTakeFirst(),
  );
}

// listQRCodes returns every sticker with its bound restaurant, newest binds first.
export async function listQRCodes(db: DB): Promise<QRCode[]> {
  const rows = await sql<{
    code: string;
    restaurant_id: string;
    restaurant_name: string;
    restaurant_slug: string;
    label: string;
    bound_at: Date | null;
    created_at: Date;
  }>`
    SELECT q.code, coalesce(q.restaurant_id::text,'') AS restaurant_id, coalesce(r.name,'') AS restaurant_name,
      coalesce(r.slug,'') AS restaurant_slug, coalesce(q.label,'') AS label, q.bound_at, q.created_at
    FROM qr_codes q LEFT JOIN restaurants r ON r.id = q.restaurant_id
    ORDER BY q.bound_at DESC NULLS LAST, q.created_at DESC`.execute(db);
  return rows.rows.map((q) => ({
    code: q.code,
    restaurantId: q.restaurant_id || undefined,
    restaurantName: q.restaurant_name || undefined,
    restaurantSlug: q.restaurant_slug || undefined,
    label: q.label || undefined,
    boundAt: q.bound_at ? new Date(q.bound_at).toISOString() : undefined,
    createdAt: new Date(q.created_at).toISOString(),
  }));
}

// listRestaurantRefs lists every restaurant across tenants (staff directory).
export async function listRestaurantRefs(db: DB): Promise<RestaurantRef[]> {
  const rows = await sql<{ id: string; tenant_id: string; name: string; slug: string }>`
    SELECT id, tenant_id, name, slug FROM restaurants ORDER BY name`.execute(db);
  return rows.rows.map((r) => ({ id: r.id, tenantId: r.tenant_id, name: r.name, slug: r.slug }));
}
