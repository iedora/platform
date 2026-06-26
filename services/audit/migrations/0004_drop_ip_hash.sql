-- 0004_drop_ip_hash.sql — drop the hashed-IP column. The raw `ip` (added in
-- 0003) is now the only IP we keep; the GDPR-hash fallback is gone by product
-- decision. Idempotent + cascades to every partition of the partitioned table.
ALTER TABLE audit_log DROP COLUMN IF EXISTS ip_hash;
