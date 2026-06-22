-- 0001_init.sql — billing service schema. Idempotent (IF NOT EXISTS), so it
-- applies cleanly against an existing prod billing DB.

-- One subscription row per (tenant, product).
CREATE TABLE IF NOT EXISTS subscriptions (
    id                  uuid        NOT NULL DEFAULT uuidv7(),
    tenant_id           uuid        NOT NULL,
    product             text        NOT NULL,             -- menu | ...
    plan_code           text        NOT NULL,
    status              text        NOT NULL DEFAULT 'active', -- active | canceled
    current_period_end  timestamptz,
    canceled_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (id),
    UNIQUE (tenant_id, product)
);

-- Append-only invoice ledger (snapshots plan_code + amount for history).
CREATE TABLE IF NOT EXISTS invoices (
    id           uuid        NOT NULL DEFAULT uuidv7(),
    tenant_id    uuid        NOT NULL,
    product      text        NOT NULL,
    plan_code    text        NOT NULL,
    amount_cents bigint      NOT NULL,
    currency     text        NOT NULL,
    status       text        NOT NULL DEFAULT 'issued',   -- issued | paid | void
    created_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS invoices_tenant_idx ON invoices (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS invoices_recent_idx ON invoices (created_at DESC);
