-- Refunds — the reverse leg of a charge, one row per refund event. A charge can
-- be refunded in full or in part (and, in principle, more than once), so refunds
-- live in their own append-only table rather than as columns on `charges`; the
-- charge is referenced by id (`charge_id`) LOGICALLY (no FK — the charges ledger
-- is product-agnostic and we keep refunds decoupled from its lifecycle). Amounts
-- are integer minor units (@iedora/billing Money). The kind that refunded it is
-- recorded (`provider`) with the provider's opaque refund id (`provider_ref`);
-- `provider_ref` is null for the manual kind (money moved back off-platform).
CREATE TABLE IF NOT EXISTS refunds (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id       uuid        NOT NULL,           -- logical ref to charges.id
  product         text        NOT NULL,           -- copied from the charge
  amount_cents    integer     NOT NULL,           -- refunded amount (<= charge gross)
  currency        text        NOT NULL,
  status          text        NOT NULL,           -- refunded|succeeded|pending|failed
  provider        text        NOT NULL,           -- kind that refunded (manual, stripe, ...)
  provider_ref    text,                           -- the provider's refund id (null for manual)
  reason          text,                           -- optional free-text reason
  idempotency_key text        UNIQUE,             -- dedupe retries
  metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refunds_charge_id_idx ON refunds (charge_id);
