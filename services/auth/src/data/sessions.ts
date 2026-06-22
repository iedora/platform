import { type Kysely, type Selectable, sql } from "kysely";

import type { AuthDB } from "../schema";

export type Session = Selectable<AuthDB["sessions"]>;

export interface NewSession {
  familyId: string;
  userId: string;
  tenantId: string | null;
  tokenHash: Buffer;
  issuedAt: Date;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  userAgent: string | null;
  ipHash: Buffer | null;
}

export async function insertSession(db: Kysely<AuthDB>, s: NewSession): Promise<string> {
  const row = await db
    .insertInto("sessions")
    .values({
      family_id: s.familyId,
      user_id: s.userId,
      tenant_id: s.tenantId,
      token_hash: s.tokenHash,
      issued_at: s.issuedAt,
      expires_at: s.expiresAt,
      absolute_expires_at: s.absoluteExpiresAt,
      user_agent: s.userAgent,
      ip_hash: s.ipHash,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

export function findByTokenHash(db: Kysely<AuthDB>, hash: Buffer): Promise<Session | undefined> {
  return db.selectFrom("sessions").selectAll().where("token_hash", "=", hash).executeTakeFirst();
}

// rotate inserts the successor and marks the old token replaced+revoked, but
// ONLY if the old row is still un-rotated (replaced_by IS NULL, revoked_at IS
// NULL) — the conditional update is the double-spend guard. Returns ok=false
// when the old row was already rotated (the loser of a refresh race / reuse),
// which the caller turns into reuse detection.
export async function rotate(
  db: Kysely<AuthDB>,
  oldId: string,
  next: NewSession,
): Promise<{ ok: boolean; nextId: string }> {
  const nextId = await insertSession(db, next);
  const res = await db
    .updateTable("sessions")
    .set({ replaced_by: nextId, revoked_at: sql`now()` })
    .where("id", "=", oldId)
    .where("replaced_by", "is", null)
    .where("revoked_at", "is", null)
    .executeTakeFirst();
  return { ok: (res.numUpdatedRows ?? 0n) > 0n, nextId };
}

export async function revokeFamily(db: Kysely<AuthDB>, familyId: string): Promise<void> {
  await db
    .updateTable("sessions")
    .set({ revoked_at: sql`now()` })
    .where("family_id", "=", familyId)
    .where("revoked_at", "is", null)
    .execute();
}

export async function revokeAllForUser(db: Kysely<AuthDB>, userId: string): Promise<void> {
  await db
    .updateTable("sessions")
    .set({ revoked_at: sql`now()` })
    .where("user_id", "=", userId)
    .where("revoked_at", "is", null)
    .execute();
}

/** A session is rotated (already used to mint a successor) — the reuse signal. */
export function isRotated(s: Session): boolean {
  return s.replaced_by !== null || s.revoked_at !== null;
}

/** A session is live (usable for refresh) at `now`. */
export function isLive(s: Session, now: Date): boolean {
  if (s.revoked_at) return false;
  return new Date(s.expires_at) > now && new Date(s.absolute_expires_at) > now;
}
