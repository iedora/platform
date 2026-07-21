-- Email service schema: just the @iedora/messaging inbox that makes SMTP
-- delivery idempotent. A producer's outbox is at-least-once; deduping on the
-- outbox message id here means a redelivery is a no-op instead of a second email.
CREATE TABLE inbox_message (
  message_id   text        PRIMARY KEY,
  topic        text        NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
