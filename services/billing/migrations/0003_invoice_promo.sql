-- Optional promo / campaign label on a recorded payment (e.g. "Early Adopter").
-- Shown as a badge in the admin payment history.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS promo text;
