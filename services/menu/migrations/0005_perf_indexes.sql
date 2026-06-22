-- Performance: make the staff-directory search index-backed, and bound bloat on
-- the upsert/delete-heavy counter tables so autovacuum stays cheap on the shared
-- single box.

-- Trigram indexes turn the directory's leading-wildcard `name ILIKE '%q%'`
-- (and slug) from a sequential scan into an index scan.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS restaurants_name_trgm ON restaurants USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS restaurants_slug_trgm ON restaurants USING gin (slug gin_trgm_ops);

-- (restaurant_id, updated_at DESC) makes `max(updated_at) WHERE restaurant_id=…`
-- an index-only one-row lookup. That's the cheap content-version probe the public
-- menu cache reads on every guest request to decide hit vs recompute.
CREATE INDEX IF NOT EXISTS menus_rest_updated_idx ON menus (restaurant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS categories_rest_updated_idx ON categories (restaurant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS items_rest_updated_idx ON items (restaurant_id, updated_at DESC);

-- Counter tables are incremented constantly (public view beacon) — UPDATEs write
-- new tuple versions. fillfactor 80 leaves room for HOT (heap-only-tuple) updates
-- so increments don't touch indexes, and a low scale_factor makes autovacuum
-- clean them in small, frequent passes instead of one big stall.
ALTER TABLE daily_view SET (fillfactor = 80, autovacuum_vacuum_scale_factor = 0.02);
ALTER TABLE item_view SET (fillfactor = 80, autovacuum_vacuum_scale_factor = 0.02);

-- rate_limit_events is DELETE-heavy (self-pruning each check for the fail-closed
-- presign/commit policies); keep its dead tuples in check too.
ALTER TABLE rate_limit_events SET (fillfactor = 80, autovacuum_vacuum_scale_factor = 0.02);
