-- PROPOSED — not yet applied. See PROJECT_PLAN_V2.md §8.
--
-- Multi-item bookings restructuring — step 2 of 3 (data backfill).
-- Converts every existing `bookings` row into exactly one `booking_items`
-- row, preserving the parent id as booking_items.booking_id — so
-- payments.booking_id (untouched, still points at the parent) and every
-- historical booking_code keep working with zero remapping.
--
-- Wrapped in one transaction with a row-count assertion: if the copied
-- count doesn't exactly match the source count, the whole thing rolls back
-- and nothing is committed. Run only after 01_schema_additive.sql. Bookings
-- is not modified by this step — the old columns stay in place and the app
-- keeps working unmodified until 03_schema_cutover.sql runs.

begin;

do $$
declare
  legacy_count integer;
  new_count integer;
  completed_count integer;
begin
  select count(*) into legacy_count from bookings;

  -- 'completed' has existed in the booking_status enum since the initial
  -- schema but grep over backend/src confirms no code path ever sets it —
  -- every booking today is either 'booked', 'out', 'returned', or
  -- 'cancelled'. Mapped defensively to 'returned' below only in case a row
  -- was ever hand-edited directly in Supabase; loudly flagged if it
  -- actually fires so it gets a manual look rather than a silent reclass.
  select count(*) into completed_count from bookings where status = 'completed';
  if completed_count > 0 then
    raise notice 'Found % booking(s) with legacy status=completed — mapped to returned on booking_items. Review manually after migration.', completed_count;
  end if;

  insert into booking_items (
    id, booking_id, item_id, quantity_booked, type, pickup_date, return_date,
    actual_return_date, status, price_charged, deposit_amount,
    deposit_collected, deposit_refunded, deposit_refund_date,
    return_checklist, return_notes, custom_addons, created_at, updated_at
  )
  select
    gen_random_uuid(),
    b.id,
    b.item_id,
    b.quantity_booked,
    b.type,
    b.pickup_date,
    b.return_date,
    b.actual_return_date,
    (case when b.status = 'completed' then 'returned' else b.status::text end)::booking_item_status,
    b.price_charged,
    b.deposit_amount,
    b.deposit_collected,
    b.deposit_refunded,
    b.deposit_refund_date,
    b.return_checklist,
    b.return_notes,
    b.custom_addons,
    b.created_at,
    b.updated_at
  from bookings b;

  select count(*) into new_count from booking_items;

  if new_count <> legacy_count then
    raise exception 'Row count mismatch: % bookings rows but % booking_items rows created — aborting, nothing committed.', legacy_count, new_count;
  end if;

  raise notice 'Backfilled % booking_items row(s) from % bookings row(s).', new_count, legacy_count;
end $$;

commit;
