-- Generic payments/charges — the shared gateway's ledger, product-agnostic.
-- Models a single money movement for ANY product: a platform charge (menu
-- subscription: payee null, platform keeps all) OR a marketplace charge (tutor
-- lesson: payer=student, payee=tutor, fee=commission, net=payout). Amounts are
-- integer minor units (@iedora/billing Money). The gateway that settled it is
-- recorded (`provider`) with its opaque payment id (`provider_ref`).
CREATE TABLE IF NOT EXISTS charges (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product         text        NOT NULL,
  payer           text        NOT NULL,
  payee           text,
  amount_cents    integer     NOT NULL,          -- gross charged to the payer
  currency        text        NOT NULL,
  fee_cents       integer     NOT NULL DEFAULT 0, -- platform's cut
  net_cents       integer     NOT NULL DEFAULT 0, -- payee's payout (gross - fee)
  status          text        NOT NULL,           -- pending|requires_action|paid|failed|refunded|canceled
  provider        text        NOT NULL,           -- gateway name (manual, stripe, ...)
  provider_ref    text,                           -- the provider's payment id
  idempotency_key text        UNIQUE,             -- dedupe retries
  metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS charges_product_payer_idx ON charges (product, payer);
CREATE INDEX IF NOT EXISTS charges_payee_idx ON charges (payee) WHERE payee IS NOT NULL;
