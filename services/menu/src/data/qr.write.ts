import { type Kysely, sql } from "kysely";

import type { MenuDB } from "../schema";
import { notFound } from "../errors";
import { normalizeQRCode } from "../qr";
import { textArray } from "./sqlutil";

type DB = Kysely<MenuDB>;

// QR sticker administration (staff, cross-tenant) — ports the write half of Go
// internal/menu/qr.go. resolveQRCode (the public scan path) lives in data/qr.ts.

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
  const r = await sql`UPDATE qr_codes SET restaurant_id=${restaurantId}, bound_at=now() WHERE code=${normalizeQRCode(code)}`.execute(db);
  if (Number(r.numAffectedRows ?? 0n) === 0) throw notFound();
}

export async function unbindQRCode(db: DB, code: string): Promise<void> {
  const r = await sql`UPDATE qr_codes SET restaurant_id=NULL, bound_at=NULL WHERE code=${normalizeQRCode(code)}`.execute(db);
  if (Number(r.numAffectedRows ?? 0n) === 0) throw notFound();
}

export async function labelQRCode(db: DB, code: string, label: string): Promise<void> {
  const r = await sql`UPDATE qr_codes SET label=nullif(${label}, '') WHERE code=${normalizeQRCode(code)}`.execute(db);
  if (Number(r.numAffectedRows ?? 0n) === 0) throw notFound();
}

export async function deleteQRCode(db: DB, code: string): Promise<void> {
  const r = await sql`DELETE FROM qr_codes WHERE code=${normalizeQRCode(code)}`.execute(db);
  if (Number(r.numAffectedRows ?? 0n) === 0) throw notFound();
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
export interface RestaurantRef {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
}

export async function listRestaurantRefs(db: DB): Promise<RestaurantRef[]> {
  const rows = await sql<{ id: string; tenant_id: string; name: string; slug: string }>`
    SELECT id, tenant_id, name, slug FROM restaurants ORDER BY name`.execute(db);
  return rows.rows.map((r) => ({ id: r.id, tenantId: r.tenant_id, name: r.name, slug: r.slug }));
}
