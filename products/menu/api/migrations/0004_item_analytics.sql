-- Per-item view counters + dedup, and guest session durations, powering the
-- dashboard's "Top dishes" and "Avg. time" metrics (Pencil "App · Dashboard").
-- Mirrors the menu-view model: a per-visitor dedup marker gates a daily
-- counter, so the same diner viewing a dish repeatedly counts once per day.

CREATE TABLE IF NOT EXISTS item_view_seen (
    visitor_id text        NOT NULL,
    item_id    uuid        NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    day        text        NOT NULL,                       -- UTC 'YYYY-MM-DD'
    seen_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (visitor_id, item_id, day)
);
CREATE INDEX IF NOT EXISTS item_view_seen_seen_at_idx ON item_view_seen (seen_at);

CREATE TABLE IF NOT EXISTS item_view (
    restaurant_id uuid    NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    tenant_id     uuid    NOT NULL,
    item_id       uuid    NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    day           text    NOT NULL,                        -- UTC 'YYYY-MM-DD'
    count         integer NOT NULL DEFAULT 0,
    PRIMARY KEY (item_id, day)
);
CREATE INDEX IF NOT EXISTS item_view_tenant_day_idx ON item_view (tenant_id, day);

CREATE TABLE IF NOT EXISTS menu_session (
    id               uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id    uuid        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    tenant_id        uuid        NOT NULL,
    day              text        NOT NULL,                 -- UTC 'YYYY-MM-DD'
    duration_seconds integer     NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS menu_session_tenant_day_idx ON menu_session (tenant_id, day);
