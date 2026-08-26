-- The birthday/anniversary WhatsApp greeting's discount percentage —
-- editable from Settings rather than hardcoded in the message template, so
-- it can change without a code deploy. NOT NULL with a constant default
-- (10), same fast-path-backfill pattern as customer_type's own migration —
-- the existing singleton row gets 10 automatically.
alter table shop_settings add column occasion_discount_percent integer not null default 10;
