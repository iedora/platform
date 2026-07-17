-- Payouts — money OWED to a marketplace payee, RECORDED now and EXECUTED later.
-- This slice only records the obligation (status 'pending', no provider/ref); a
-- later execution step performs the actual transfer and settles the row. Amounts
-- are integer minor units (@iedora/billing Money). `provider`/`provider_ref` stay
-- null until execution names the gateway that moved the money.
CREATE TABLE IF NOT EXISTS payouts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product         text,                            -- which product this payout is for
  payee           text        NOT NULL,            -- who gets paid
  amount_cents    integer     NOT NULL,            -- amount owed to the payee
  currency        text        NOT NULL,
  status          text        NOT NULL DEFAULT 'pending', -- pending|paid|failed|canceled
  provider        text,                            -- gateway name, set at execution
  provider_ref    text,                            -- the provider's transfer id, set at execution
  idempotency_key text        UNIQUE,              -- dedupe retries
  metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payouts_payee_idx ON payouts (payee);
