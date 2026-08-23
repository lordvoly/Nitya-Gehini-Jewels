-- Dedicated, unguessable identifier for public receipt sharing (WhatsApp
-- links etc.) — deliberately separate from both the visible booking_code
-- (sequential-looking, e.g. "C/059") and the internal bookings.id (already
-- a UUID, but reused throughout the authenticated app; we don't want that
-- same value to also double as the one thing the public internet can key
-- off of). 24 bytes (192 bits) of randomness via pgcrypto's
-- gen_random_bytes() (already enabled, see 20260804000000_init_schema.sql),
-- hex-encoded so it's guaranteed URL-safe with no encoding edge cases.
--
-- NOT NULL with a volatile DEFAULT forces Postgres off the fast
-- metadata-only ADD COLUMN path — it must rewrite the table and evaluate
-- the default fresh per row, so every existing booking gets backfilled
-- with its own independently-random token in this same statement, not one
-- shared value copied to every row. Trivial at this table's size.
alter table bookings
  add column share_token text not null default encode(gen_random_bytes(24), 'hex') unique;
