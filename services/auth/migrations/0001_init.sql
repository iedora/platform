-- 0001_init.sql — authentication schema. Idempotent (IF NOT EXISTS), so it
-- applies cleanly against an existing prod auth DB.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS citext;

-- Tenants (organizations).
CREATE TABLE IF NOT EXISTS tenants (
    id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug        text UNIQUE,
    name        text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
    id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    email             citext NOT NULL UNIQUE,
    password_hash     text NOT NULL,            -- argon2id PHC string
    name              text,
    role              text,                     -- staff preset: iedora-admin / iedora-support
    email_verified_at timestamptz,
    banned            boolean NOT NULL DEFAULT false,
    ban_reason        text,
    ban_expires_at    timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Many-to-many user ↔ tenant with a per-tenant role.
CREATE TABLE IF NOT EXISTS memberships (
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role       text NOT NULL DEFAULT 'member',  -- owner | member | viewer
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, tenant_id)
);

-- Refresh-token sessions. Rows sharing family_id form a rotation chain opened at
-- a single login (see the refresh slice for the rotation + reuse-detection rule).
CREATE TABLE IF NOT EXISTS sessions (
    id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    family_id   uuid NOT NULL,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id   uuid,                            -- active tenant pinned to this session
    token_hash  bytea NOT NULL UNIQUE,           -- sha256(opaque refresh token)
    issued_at   timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL,            -- sliding refresh TTL
    absolute_expires_at timestamptz NOT NULL,    -- hard cap; re-login required past this
    revoked_at  timestamptz,
    replaced_by uuid REFERENCES sessions(id),
    user_agent  text,
    ip_hash     bytea
);

CREATE INDEX IF NOT EXISTS sessions_family_idx ON sessions (family_id);
CREATE INDEX IF NOT EXISTS sessions_user_active_idx ON sessions (user_id) WHERE revoked_at IS NULL;
