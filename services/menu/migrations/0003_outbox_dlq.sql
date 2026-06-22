-- 0003_outbox_dlq.sql — see auth/0005: poison / dead-letter columns for the
-- Postgres-native audit relay (attempts/last_error/failed_at) + a claim index
-- that excludes dead-lettered rows.
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS attempts   int NOT NULL DEFAULT 0;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS failed_at  timestamptz;

DROP INDEX IF EXISTS outbox_unpublished_idx;
CREATE INDEX IF NOT EXISTS outbox_unpublished_idx ON outbox (created_at)
    WHERE published_at IS NULL AND failed_at IS NULL;
