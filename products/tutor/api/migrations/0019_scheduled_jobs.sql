-- Durable job queue for @iedora/jobs — lesson timers (room open, payment settle,
-- auto-release) that used to run on an external Inngest worker now run here, on
-- Postgres. The runner does DML only; this table is created by the migration
-- (owner role). Canonical DDL lives in @iedora/jobs (SCHEDULED_JOBS_DDL).
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
CREATE INDEX IF NOT EXISTS scheduled_jobs_due    ON scheduled_jobs (status, run_at);
CREATE INDEX IF NOT EXISTS scheduled_jobs_dedupe ON scheduled_jobs (dedupe_key) WHERE dedupe_key IS NOT NULL;
