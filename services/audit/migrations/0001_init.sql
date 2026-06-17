-- +goose Up
-- 0001_init.sql — generic, append-only audit log shared by every product slice
-- (auth, menu, admin). Schema follows the actor/action/target/context/outcome
-- model common to CADF, CloudTrail, and Elastic Common Schema. Copied verbatim
-- from the Go backend (migrations/audit/0001_init.sql) — the schema is unchanged
-- by the TS migration; only the runner differs. goose annotations are SQL
-- comments, so this file applies cleanly via the Bun runner or psql.
--
-- Partitioned by month so retention is a metadata-only DROP PARTITION. In prod,
-- let pg_partman create future partitions; the DEFAULT partition below keeps
-- inserts working out of the box until that's wired.

CREATE TABLE IF NOT EXISTS audit_log (
    id             uuid        NOT NULL DEFAULT uuidv7(),  -- time-ordered (PG18)
    at             timestamptz NOT NULL DEFAULT now(),      -- event time (from the emitting service)
    source         text        NOT NULL DEFAULT 'unknown',  -- emitting service: auth | billing | ...
    tenant_id      uuid,                                   -- scoping tenant; NULL for system events
    action         text        NOT NULL,                   -- dotted: "<domain>.<object>.<verb>"
    outcome        text        NOT NULL DEFAULT 'success',  -- success | failure | unknown
    actor_type     text        NOT NULL DEFAULT 'system',   -- user | service | system | apikey
    actor_id       text,                                    -- NULL for anonymous/system
    target_type    text,                                    -- polymorphic resource type
    target_id      text,
    session_id     text,
    trace_id       text,                                    -- OTel correlation
    ip_hash        bytea,                                   -- hashed, never the raw IP (GDPR)
    user_agent     text,
    meta           jsonb       NOT NULL DEFAULT '{}'::jsonb, -- slice detail; NO PII/secrets
    schema_version smallint    NOT NULL DEFAULT 1,
    message_id     uuid,                                    -- producer event id; consumer dedup key (inbox)
    PRIMARY KEY (id, at)                                    -- partition key must be in the PK
) PARTITION BY RANGE (at);

-- Catch-all partition; replace with monthly partitions via pg_partman in prod.
CREATE TABLE IF NOT EXISTS audit_log_default PARTITION OF audit_log DEFAULT;

-- Idempotent-consumer guard (inbox folded into the table): a redelivered event
-- (same message_id) is a no-op via INSERT ... ON CONFLICT DO NOTHING.
CREATE UNIQUE INDEX IF NOT EXISTS audit_log_message_id_idx ON audit_log (message_id, at);

-- Workhorse index: tenant activity feed, newest first. Keyset-paginate on (at,id).
CREATE INDEX IF NOT EXISTS audit_log_tenant_at_idx ON audit_log (tenant_id, at DESC, id DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx     ON audit_log (tenant_id, actor_id, at DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_idx    ON audit_log (tenant_id, action, at DESC);

-- Append-only enforcement (Layer 1). Belt-and-suspenders to the DB grants:
-- even a misconfigured grant cannot mutate history.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only (% blocked)', TG_OP;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS audit_log_no_mutate ON audit_log;
CREATE TRIGGER audit_log_no_mutate
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
