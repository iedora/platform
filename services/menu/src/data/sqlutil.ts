import { sql } from "kysely";

import { notFound } from "../errors";

// Write-result guards over a raw `sql\`\`.execute()` result. Every single-row
// write repeats the same "nothing matched → 404" check; these centralize it so
// the not-found contract lives in one place.

/** Throws notFound() when an UPDATE/DELETE affected no rows. */
export function affectedOrNotFound(r: { numAffectedRows?: bigint }): void {
  if (Number(r.numAffectedRows ?? 0n) === 0) throw notFound();
}

/** Returns the single RETURNING row, or throws notFound() when none came back. */
export function returnedOrNotFound<T>(r: { rows: T[] }): T {
  const row = r.rows[0];
  if (!row) throw notFound();
  return row;
}

/** Throws notFound() when a Kysely UPDATE/DELETE (executeTakeFirst) changed no
 * rows — the builder-query counterpart of affectedOrNotFound. */
export function changedOrNotFound(
  r: { numUpdatedRows?: bigint; numDeletedRows?: bigint } | undefined,
): void {
  if ((r?.numUpdatedRows ?? r?.numDeletedRows ?? 0n) === 0n) throw notFound();
}

// Bun's SQL returns jsonb columns as raw strings; parse to T, tolerating an
// already-parsed value (should the driver change). Null/unparseable → null.
export function parseJson<T>(v: unknown): T | null {
  if (v == null) return null;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return null;
    }
  }
  return v as T;
}

/** UTC calendar day (YYYY-MM-DD) of a Date. */
export function dayString(t: Date): string {
  return t.toISOString().slice(0, 10);
}

/** A Date shifted by `n` whole UTC days. */
export function addDays(t: Date, n: number): Date {
  const d = new Date(t);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

// Shared raw-SQL value builders. Bun's SQL binding does not encode a JS array as
// a Postgres array via the `sql` tag, so build ARRAY[...] from bound params
// (injection-safe — each element is a parameter, never interpolated text).

export function textArray(values: string[]) {
  if (values.length === 0) return sql`ARRAY[]::text[]`;
  return sql`ARRAY[${sql.join(values.map((v) => sql`${v}`))}]::text[]`;
}

export function uuidArray(values: string[]) {
  if (values.length === 0) return sql`ARRAY[]::uuid[]`;
  return sql`ARRAY[${sql.join(values.map((v) => sql`${v}`))}]::uuid[]`;
}

// jsonb column value: NULL when null, else the JS value bound directly and cast
// to jsonb. The driver encodes a JS object/array as a jsonb object/array; a
// pre-stringified value would instead be stored as a jsonb *string scalar*
// (which then breaks server-side `-`/`||` operators, e.g. the language rotation).
export function jsonbOrNull(v: unknown) {
  return v == null ? sql`NULL` : sql`${v as never}::jsonb`;
}
