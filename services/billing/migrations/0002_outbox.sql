-- 0002_outbox.sql — transactional outbox for audit events (the Postgres-native
-- design: server-kit's relay drains this straight into the audit DB).
--
-- Idempotent against EITHER a fresh DB or the existing prod outbox table. Prod's
-- table predates the dead-letter columns (an earlier DLQ migration was never
-- deployed), and CREATE TABLE IF NOT EXISTS won't add columns to a table
-- that already exists — so the evolved columns are added with ALTER … IF NOT
-- EXISTS, and the partial index (which references failed_at) is (re)created last.

CREATE TABLE IF NOT EXISTS outbox (
    id           uuid        NOT NULL DEFAULT uuidv7(),  -- also the audit_log dedup id
    created_at   timestamptz NOT NULL DEFAULT now(),
    subject      text        NOT NULL,
    payload      bytea       NOT NULL,                   -- serialized audit envelope (JSON)
    traceparent  text,
    published_at timestamptz,                            -- NULL until the relay delivers it
    attempts     int         NOT NULL DEFAULT 0,         -- delivery attempts (poison guard)
    last_error   text,
    failed_at    timestamptz,                            -- set when dead-lettered
    PRIMARY KEY (id)
);

-- Bring a pre-existing (pre-DLQ) outbox table up to the current shape.
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS traceparent text;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS attempts    int NOT NULL DEFAULT 0;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS last_error  text;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS failed_at   timestamptz;

-- Drives the relay's claim query; only the live, undelivered tail. Dropped first
-- so a pre-existing index with the old (pre-DLQ) predicate is replaced.
DROP INDEX IF EXISTS outbox_unpublished_idx;
CREATE INDEX IF NOT EXISTS outbox_unpublished_idx ON outbox (created_at)
    WHERE published_at IS NULL AND failed_at IS NULL;
