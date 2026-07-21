-- Delivery log: one row per successfully-sent email, so the platform can answer
-- "was this email sent?" over the SDK (GET /deliveries) instead of guessing from
-- SMTP logs. The send slice records here after the mailer succeeds. Keyset
-- pagination on (at DESC, id DESC); source is the producer (service-token client).
CREATE TABLE email_delivery (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at         timestamptz NOT NULL DEFAULT now(),
  source     text        NOT NULL,
  tenant_id  text,
  to_addr    text        NOT NULL,
  subject    text        NOT NULL,
  status     text        NOT NULL DEFAULT 'sent',
  error      text,
  -- The producer's outbox message id when the send was relayed (null for a
  -- direct send); lets a delivery be traced back to its originating event.
  message_id text
);

CREATE INDEX email_delivery_at_id_idx ON email_delivery (at DESC, id DESC);
CREATE INDEX email_delivery_source_idx ON email_delivery (source);
CREATE INDEX email_delivery_to_idx     ON email_delivery (to_addr);
