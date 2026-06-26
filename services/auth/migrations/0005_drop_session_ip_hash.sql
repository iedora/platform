-- 0005_drop_session_ip_hash.sql — drop the hashed-IP column from sessions. The
-- raw `ip` (added in 0004) is the only IP we keep now. Idempotent.
ALTER TABLE sessions DROP COLUMN IF EXISTS ip_hash;
