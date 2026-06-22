-- 0003_password_reset_tokens.sql — single-use, hashed, expiring password-reset
-- tokens (OWASP Forgot Password Cheat Sheet).
--
-- The raw token is NEVER stored: only its sha256 hash lives here (same scheme as
-- sessions.token_hash). A row is consumed by setting claimed_at, which the reset
-- endpoint does under a conditional UPDATE so a token can be used at most once.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id         uuid        NOT NULL DEFAULT uuidv7(),
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash bytea       NOT NULL UNIQUE,     -- sha256(opaque token); never the raw token
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,            -- short TTL (config API_RESET_TOKEN_TTL)
    claimed_at timestamptz,                      -- set once, when the token is spent
    PRIMARY KEY (id)
);

-- Drives both the active-token lookup and the per-account throttle: only the
-- unspent tokens for a user, newest first.
CREATE INDEX IF NOT EXISTS password_reset_tokens_active_idx
    ON password_reset_tokens (user_id, created_at)
    WHERE claimed_at IS NULL;
