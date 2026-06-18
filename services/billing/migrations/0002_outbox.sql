-- +goose Up
-- 0002_outbox.sql — transactional outbox for audit events (the Postgres-native
-- design: server-kit's relay drains this straight into the audit DB). Columns
-- consolidate the Go evolution (outbox + DLQ); idempotent, so it no-ops against
-- the existing prod outbox table.

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

-- Drives the relay's claim query; only the live, undelivered tail.
CREATE INDEX IF NOT EXISTS outbox_unpublished_idx ON outbox (created_at)
    WHERE published_at IS NULL AND failed_at IS NULL;
