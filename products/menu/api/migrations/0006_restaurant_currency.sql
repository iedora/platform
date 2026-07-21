-- Restaurant-level default currency. New dishes inherit it (instead of the old
-- hard-coded EUR), and the owner picks it once in restaurant settings. Existing
-- rows backfill to EUR — the value the codebase has always defaulted to — so the
-- column is NOT NULL from the start without a separate backfill pass.
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS default_currency text NOT NULL DEFAULT 'EUR';
