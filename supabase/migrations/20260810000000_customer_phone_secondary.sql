-- Plain optional alternate contact number (e.g. a family member's phone, or
-- a second number the customer gave at intake) — not a second unique
-- identifier. No unique constraint, and deliberately not part of
-- duplicate-detection: phone stays the sole field driving that (see
-- customers.ts). Nullable, no default.
alter table customers add column phone_secondary text;
