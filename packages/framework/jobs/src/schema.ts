// The one table this package needs. Because services run as a DML-only role (the
// DDL/DML split), the table is created by a migration (the owner role) — NOT at
// runtime. This DDL is the canonical definition; a service's migration copies it,
// and tests apply it directly via `ensureSchema`.
export const SCHEDULED_JOBS_DDL = `
CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text        NOT NULL,
  run_at       timestamptz NOT NULL,
  payload      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key   text,
  status       text        NOT NULL DEFAULT 'pending',   -- pending|running|done|failed|cancelled
  attempts     int         NOT NULL DEFAULT 0,
  max_attempts int         NOT NULL DEFAULT 5,
  last_error   text,
  locked_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
-- The claim query filters by (status, run_at); the partial index serves cancelByKey.
CREATE INDEX IF NOT EXISTS scheduled_jobs_due    ON scheduled_jobs (status, run_at);
CREATE INDEX IF NOT EXISTS scheduled_jobs_dedupe ON scheduled_jobs (dedupe_key) WHERE dedupe_key IS NOT NULL;
`.trim()

export type JobStatus = "pending" | "running" | "done" | "failed" | "cancelled"
