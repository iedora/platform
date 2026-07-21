-- 0001_init.sql — menu service schema.
--
-- Redesigned from the drizzle original, same 9-table shape: the content
-- hierarchy (restaurant → menu → category → item), public-view metrics
-- (view_seen dedup + daily_view counters), the physical QR-sticker registry,
-- the Postgres sliding-window rate limiter, and the AI-generation quota ledger.
-- Changes from the TS schema: uuidv7 PKs (PG18, time-ordered), timestamptz
-- everywhere, text[] for flat string lists (tags, languages); jsonb only where
-- the value is genuinely structured (i18n maps, theme, variants).
--
-- i18n model: plain columns (name, description) hold the restaurant's default
-- language; *_i18n jsonb maps hold non-default overrides only. Readers apply
-- the fallback chain requested → default → empty.

CREATE TABLE IF NOT EXISTS restaurants (
    id                      uuid        PRIMARY KEY DEFAULT uuidv7(),
    tenant_id               uuid        NOT NULL,            -- auth-service tenant; no cross-DB FK
    name                    text        NOT NULL,
    slug                    text        NOT NULL UNIQUE,
    description             text,
    description_i18n        jsonb,
    logo_url                text,
    banner_url              text,
    theme                   jsonb,                            -- {primaryColor?, secondaryColor?, font?, layout?}
    default_language        text        NOT NULL DEFAULT 'en',
    supported_languages     text[]      NOT NULL DEFAULT '{en}',
    onboarding_completed_at timestamptz,                      -- NULL = mid-wizard
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS restaurants_tenant_idx ON restaurants (tenant_id);

CREATE TABLE IF NOT EXISTS menus (
    id               uuid        PRIMARY KEY DEFAULT uuidv7(),
    restaurant_id    uuid        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name             text        NOT NULL,
    name_i18n        jsonb,
    description      text,
    description_i18n jsonb,
    position         integer     NOT NULL DEFAULT 0,
    active           boolean     NOT NULL DEFAULT true,       -- public renders active only
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS menus_restaurant_idx ON menus (restaurant_id);

-- restaurant_id is denormalized onto categories + items so every mutation can
-- include it in the WHERE clause (tenancy defense-in-depth, one fewer join).
CREATE TABLE IF NOT EXISTS categories (
    id                     uuid        PRIMARY KEY DEFAULT uuidv7(),
    menu_id                uuid        NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
    restaurant_id          uuid        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name                   text        NOT NULL,
    name_i18n              jsonb,
    description            text,
    description_i18n       jsonb,
    position               integer     NOT NULL DEFAULT 0,
    translations_synced_at timestamptz,                       -- stale iff NULL or < updated_at
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS categories_menu_idx ON categories (menu_id);
CREATE INDEX IF NOT EXISTS categories_restaurant_idx ON categories (restaurant_id);

CREATE TABLE IF NOT EXISTS items (
    id                     uuid        PRIMARY KEY DEFAULT uuidv7(),
    category_id            uuid        NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    restaurant_id          uuid        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name                   text        NOT NULL,
    name_i18n              jsonb,
    description            text,
    description_i18n       jsonb,
    price_cents            integer     NOT NULL CHECK (price_cents >= 0),
    currency               text        NOT NULL DEFAULT 'EUR',
    image_url              text,
    position               integer     NOT NULL DEFAULT 0,
    available              boolean     NOT NULL DEFAULT true, -- false = hidden from guests
    tags                   text[]      NOT NULL DEFAULT '{}',
    variants               jsonb,                             -- [{label, labelI18n?, priceCents}]; NULL = single price
    translations_synced_at timestamptz,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS items_category_idx ON items (category_id);
CREATE INDEX IF NOT EXISTS items_restaurant_idx ON items (restaurant_id);

-- Physical sticker registry. Cross-tenant (staff-managed): codes exist before
-- they are bound, survive restaurant deletion (SET NULL → reusable sticker).
CREATE TABLE IF NOT EXISTS qr_codes (
    code          text        PRIMARY KEY,                    -- normalized lowercase
    restaurant_id uuid        REFERENCES restaurants(id) ON DELETE SET NULL,
    label         text,
    bound_at      timestamptz,                                -- NULL = unbound
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qr_codes_restaurant_idx ON qr_codes (restaurant_id);

-- Public-view metrics, two-table atomic pattern: view_seen dedups one count per
-- visitor/restaurant/hour; daily_view accumulates per-day-per-language counters.
CREATE TABLE IF NOT EXISTS view_seen (
    visitor_id    text        NOT NULL,
    restaurant_id uuid        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    hour_bucket   text        NOT NULL,                       -- UTC 'YYYY-MM-DD-HH'
    seen_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (visitor_id, restaurant_id, hour_bucket)
);
CREATE INDEX IF NOT EXISTS view_seen_seen_at_idx ON view_seen (seen_at);

CREATE TABLE IF NOT EXISTS daily_view (
    restaurant_id uuid    NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    tenant_id     uuid    NOT NULL,
    day           text    NOT NULL,                           -- UTC 'YYYY-MM-DD'
    language      text    NOT NULL,
    count         integer NOT NULL DEFAULT 0,
    PRIMARY KEY (restaurant_id, day, language)
);
CREATE INDEX IF NOT EXISTS daily_view_tenant_day_idx ON daily_view (tenant_id, day);

-- Sliding-window rate limiter: one row per event; the check transaction prunes
-- expired rows for its key, so the table stays bounded without a vacuum job.
CREATE TABLE IF NOT EXISTS rate_limit_events (
    key         text        NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_limit_events_key_time_idx ON rate_limit_events (key, occurred_at);

-- AI menu-generation quota ledger (rolling 7-day window per tenant).
CREATE TABLE IF NOT EXISTS ai_generations (
    id         uuid        PRIMARY KEY DEFAULT uuidv7(),
    tenant_id  uuid        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_generations_tenant_time_idx ON ai_generations (tenant_id, created_at);

-- Transactional outbox for audit events (same pattern as auth/billing).
CREATE TABLE IF NOT EXISTS outbox (
    id           uuid        NOT NULL DEFAULT uuidv7(),
    created_at   timestamptz NOT NULL DEFAULT now(),
    subject      text        NOT NULL,
    payload      bytea       NOT NULL,
    traceparent  text,
    published_at timestamptz,
    PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS outbox_unpublished_idx ON outbox (created_at) WHERE published_at IS NULL;
