-- Adopt @iedora/audit's schema (partitioned entity/action audit log) + the
-- @iedora/messaging inbox for idempotent ingestion.
--
-- DESTRUCTIVE on an existing DB: it drops menu's audit_log. In prod, migrate the
-- existing rows first — target_type/id → entity_type/id, session_id/trace_id →
-- metadata (keys session_id/trace_id), at → occurred_at, meta → metadata.
DROP TABLE IF EXISTS audit_log CASCADE;

CREATE TABLE audit_log (
  id             uuid        NOT NULL DEFAULT uuidv7(),
  tenant_id      uuid,
  source         text,
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  actor_type     text,
  actor_id       text,
  action         text        NOT NULL,
  entity_type    text,
  entity_id      text,
  outcome        text        NOT NULL DEFAULT 'success',
  old_data       jsonb,
  new_data       jsonb,
  changed_fields jsonb,
  metadata       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ip             text,
  user_agent     text,
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);
CREATE TABLE audit_log_default PARTITION OF audit_log DEFAULT;

CREATE INDEX audit_log_occurred_brin ON audit_log USING brin (occurred_at);
CREATE INDEX audit_log_entity_idx ON audit_log (tenant_id, entity_type, entity_id, occurred_at DESC);
CREATE INDEX audit_log_actor_idx  ON audit_log (tenant_id, actor_id, occurred_at DESC);
CREATE INDEX audit_log_action_idx ON audit_log (tenant_id, action, occurred_at DESC);
CREATE INDEX audit_log_source_idx ON audit_log (tenant_id, source, occurred_at DESC);

CREATE TABLE IF NOT EXISTS inbox_message (
  message_id   text        PRIMARY KEY,
  topic        text        NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
