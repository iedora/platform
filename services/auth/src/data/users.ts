import { type Kysely, type Selectable, sql } from "kysely";
import { HTTPException } from "hono/http-exception";

import type { AuthDB } from "../schema";
import { isUniqueViolation } from "../errors";

export type User = Selectable<AuthDB["users"]>;

// Single-column user lookup (the two public loaders differ only by the column).
function findUserBy(db: Kysely<AuthDB>, col: "email" | "id", value: string): Promise<User | undefined> {
  return db.selectFrom("users").selectAll().where(col, "=", value).executeTakeFirst();
}

export function findUserByEmail(db: Kysely<AuthDB>, email: string): Promise<User | undefined> {
  return findUserBy(db, "email", email);
}

export function findUserById(db: Kysely<AuthDB>, id: string): Promise<User | undefined> {
  return findUserBy(db, "id", id);
}

export function createUser(
  db: Kysely<AuthDB>,
  input: { email: string; passwordHash: string; name?: string | null },
): Promise<User> {
  return db
    .insertInto("users")
    .values({ email: input.email, password_hash: input.passwordHash, name: input.name ?? null })
    .returningAll()
    .executeTakeFirstOrThrow();
}

/** The one "create a user" entry point: createUser with a duplicate-email unique
 *  violation mapped to a clean 409. Shared by register + ownership transfer so
 *  the conflict handling lives in a single place. Hash the password BEFORE the
 *  caller's tx (argon2 is expensive) and pass it in. */
export async function createUserOr409(
  db: Kysely<AuthDB>,
  input: { email: string; passwordHash: string; name?: string | null },
): Promise<User> {
  try {
    return await createUser(db, input);
  } catch (err) {
    if (isUniqueViolation(err)) throw new HTTPException(409, { message: "email already registered" });
    throw err;
  }
}

/** Sets a user's global role (e.g. "admin"). Used by the admin-email hook. */
export async function setRole(db: Kysely<AuthDB>, id: string, role: string): Promise<void> {
  await db
    .updateTable("users")
    .set({ role, updated_at: sql`now()` })
    .where("id", "=", id)
    .execute();
}

export async function updatePasswordHash(db: Kysely<AuthDB>, id: string, hash: string): Promise<void> {
  await db
    .updateTable("users")
    .set({ password_hash: hash, updated_at: sql`now()` })
    .where("id", "=", id)
    .execute();
}

export function listMemberships(
  db: Kysely<AuthDB>,
  userId: string,
): Promise<{ tenant_id: string; role: string }[]> {
  return db
    .selectFrom("memberships")
    .select(["tenant_id", "role"])
    .where("user_id", "=", userId)
    .orderBy("created_at")
    .execute();
}

/** True if the user is currently banned (port of domain.User.IsBanned). */
export function isBanned(u: User, now: Date): boolean {
  if (!u.banned) return false;
  if (u.ban_expires_at && new Date(u.ban_expires_at) < now) return false; // expired ban
  return true;
}
