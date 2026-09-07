-- Who physically brought a rental item back at return time — mirrors
-- pickup_person_* (20260904000000_pickup_person.sql) exactly, reusing the
-- same self/family/porter enum rather than a new type, since the concept
-- and its three values are identical in both directions. Recorded only
-- when Process Return is submitted (POST .../return), never inferred or
-- backfilled. Unlike pickup_person_*, there's no "undo return" endpoint
-- yet to clear these on, matching how actual_return_date itself has no
-- undo either.
alter table booking_items add column returned_person_type pickup_person_type;
alter table booking_items add column returned_person_name text;
alter table booking_items add column returned_person_phone text;
