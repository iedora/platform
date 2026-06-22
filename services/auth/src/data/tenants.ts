import type { TenantWithOwner } from "@iedora/contracts";
import type { Kysely } from "kysely";

import type { AuthDB } from "../schema";

/** A tenant by id joined to its owner user (the membership with role 'owner').
 * Returns undefined when the tenant doesn't exist or has no owner membership. */
export async function findTenantWithOwner(
  db: Kysely<AuthDB>,
  tenantId: string,
): Promise<TenantWithOwner | undefined> {
  const row = await db
    .selectFrom("tenants")
    .innerJoin("memberships", (join) =>
      join.onRef("memberships.tenant_id", "=", "tenants.id").on("memberships.role", "=", "owner"),
    )
    .innerJoin("users", "memberships.user_id", "users.id")
    .select([
      "tenants.id as id",
      "tenants.name as name",
      "tenants.slug as slug",
      "users.id as owner_id",
      "users.email as owner_email",
      "users.name as owner_name",
    ])
    .where("tenants.id", "=", tenantId)
    .executeTakeFirst();
  if (!row) return undefined;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    owner: { id: row.owner_id, email: row.owner_email, name: row.owner_name },
  };
}

/** Every tenant joined to its owner (membership role 'owner'), name-ascending.
 * Tenants without an owner membership are omitted — the admin picker only
 * assigns to tenants that already have an owner. */
export async function listTenantsWithOwners(db: Kysely<AuthDB>): Promise<TenantWithOwner[]> {
  const rows = await db
    .selectFrom("tenants")
    .innerJoin("memberships", (join) =>
      join.onRef("memberships.tenant_id", "=", "tenants.id").on("memberships.role", "=", "owner"),
    )
    .innerJoin("users", "memberships.user_id", "users.id")
    .select([
      "tenants.id as id",
      "tenants.name as name",
      "tenants.slug as slug",
      "users.id as owner_id",
      "users.email as owner_email",
      "users.name as owner_name",
    ])
    .orderBy("tenants.name", "asc")
    .execute();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    owner: { id: row.owner_id, email: row.owner_email, name: row.owner_name },
  }));
}

export async function createTenant(db: Kysely<AuthDB>, name: string): Promise<string> {
  const row = await db
    .insertInto("tenants")
    .values({ name })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

export async function addMembership(
  db: Kysely<AuthDB>,
  m: { userId: string; tenantId: string; role: string },
): Promise<void> {
  await db
    .insertInto("memberships")
    .values({ user_id: m.userId, tenant_id: m.tenantId, role: m.role })
    .execute();
}
