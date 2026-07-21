-- Messaging outbox/inbox (@iedora/messaging). Supersedes the legacy `outbox`
-- table; the relay now drains outbox_message. The old table is left in place so
-- any undelivered rows can be drained before it is dropped.
CREATE TABLE IF NOT EXISTS outbox_message (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  topic           text        NOT NULL,
  payload         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  attempts        integer     NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  delivered_at    timestamptz,
  dead_at         timestamptz,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outbox_message_due_idx ON outbox_message (next_attempt_at)
  WHERE delivered_at IS NULL AND dead_at IS NULL;
CREATE TABLE IF NOT EXISTS inbox_message (
  message_id   text        PRIMARY KEY,
  topic        text        NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
