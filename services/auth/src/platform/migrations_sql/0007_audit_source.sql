-- @iedora/audit 0.2.0 adds a generic `source` column (emitting service); record()
-- writes it, so the table needs it. Nullable — auth is a single emitter.
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS source text;
