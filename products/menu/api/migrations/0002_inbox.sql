-- 0002_inbox.sql — consumer-side idempotency guard (inbox pattern).
-- See auth/0004_inbox.sql for the full design rationale.

CREATE TABLE IF NOT EXISTS inbox (
    message_id     text        NOT NULL,
    consumer_group text        NOT NULL,
    processed_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (message_id, consumer_group)
);

CREATE INDEX IF NOT EXISTS inbox_processed_at_idx ON inbox (processed_at);
