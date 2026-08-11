-- PROPOSED — verification plan for the booking_items restructuring.
-- Not a migration; these are checks to run by hand (Supabase SQL editor)
-- at each gate. See PROJECT_PLAN_V2.md §8 for the full narrative.
--
-- Real item to spot-check by name throughout: 'Peacock Bridal Set'
-- (item_code NGJ-0001) — the one real, non-test row that must come through
-- byte-for-byte untouched.

-- ============================================================
-- GATE 0 — before touching anything. Record these numbers.
-- ============================================================

select count(*) as bookings_count from bookings;
select count(*) as payments_count from payments; -- must be unaffected by this entire migration
select status, count(*) from bookings group by status order by status;
select type, count(*) from bookings group by type order by type;
select sum(price_charged) as total_price_charged from bookings;
select sum(deposit_amount) as total_deposit_amount from bookings;

-- NGJ-0001 baseline — save this output verbatim to diff against later gates
select b.id as booking_id, b.booking_code, b.type, b.pickup_date, b.return_date,
       b.actual_return_date, b.status, b.price_charged, b.deposit_amount,
       b.deposit_collected, b.deposit_refunded, b.return_checklist, b.return_notes,
       b.custom_addons, i.item_code, i.name as item_name
from bookings b
join items i on i.id = b.item_id
where i.name = 'Peacock Bridal Set' and i.item_code = 'NGJ-0001'
order by b.pickup_date;

-- ============================================================
-- GATE 1 — after 01_schema_additive.sql
-- ============================================================

-- booking_items exists and is empty; bookings is completely untouched
select count(*) from booking_items; -- expect 0
select count(*) from bookings;      -- expect same as Gate 0

-- The five new views exist under their _v2 names and are queryable
-- (booking_financials_v2/sequence_v2/overdue_v2/upcoming_v2 will be empty
-- until the backfill runs — expected, not a failure. booking_status_v2 is
-- a left join from bookings, so it already returns one row per EXISTING
-- booking, just with active_item_count/resolved_item_count both 0 and
-- computed_status = 'cancelled' — the "zero items" fallback — until the
-- backfill gives each of those rows a real booking_items row)
select count(*) from booking_financials_v2; -- expect 0
select count(*) from booking_sequence_v2;   -- expect 0
select count(*) from overdue_rentals_v2;    -- expect 0
select count(*) from upcoming_returns_v2;   -- expect 0
select count(*) from booking_status_v2;     -- expect same as bookings_count (Gate 0)
select computed_status, count(*) from booking_status_v2 group by computed_status;
-- expect a single row: cancelled, count = bookings_count — confirms the
-- "zero booking_items" fallback behaves as documented, not as a bug

-- Prove non-destructiveness: the OLD views, under their permanent names,
-- are completely unaffected by the _v2 views' existence — same output as
-- Gate 0. The production app, still pointed at these old views/columns,
-- keeps working through this entire step with zero behavior change.
select count(*) from booking_financials; -- expect same as a pre-migration count
select b.id as booking_id, b.booking_code, b.type, b.pickup_date, b.return_date,
       b.actual_return_date, b.status, b.price_charged, b.deposit_amount,
       b.deposit_collected, b.deposit_refunded, b.return_checklist, b.return_notes,
       b.custom_addons, i.item_code, i.name as item_name
from bookings b
join items i on i.id = b.item_id
where i.name = 'Peacock Bridal Set' and i.item_code = 'NGJ-0001'
order by b.pickup_date;
-- must be byte-for-byte identical to the Gate 0 snapshot

-- ============================================================
-- GATE 2 — after 02_data_backfill.sql (still before cutover)
-- ============================================================

-- Row counts must match exactly
select
  (select count(*) from bookings) as bookings_count,
  (select count(*) from booking_items) as booking_items_count;
-- FAIL if these differ — the backfill's own in-transaction assertion should
-- already have made this impossible (it rolls back on mismatch), but check
-- anyway rather than trusting that alone.

-- Every legacy booking has exactly one booking_items row, no more, no fewer
select bi.booking_id, count(*)
from booking_items bi
group by bi.booking_id
having count(*) <> 1;
-- expect zero rows

-- No orphaned parent (a bookings row with no corresponding booking_items row)
select b.id, b.booking_code
from bookings b
left join booking_items bi on bi.booking_id = b.id
where bi.id is null;
-- expect zero rows

-- Status distribution must match 1:1 between the two tables (accounting
-- for the completed -> returned mapping, which the backfill script's
-- own RAISE NOTICE will have already surfaced if it applied to any row)
select status::text, count(*) from bookings group by status
except
select status::text, count(*) from booking_items group by status;
-- expect zero rows UNLESS legacy 'completed' rows existed, in which case
-- diff manually against the backfill's NOTICE output — do not proceed
-- past this gate until that diff is understood and accepted.

-- Financial totals must match exactly (no partial copy, no double-count)
select
  (select sum(price_charged) from bookings) as bookings_total_price,
  (select sum(price_charged) from booking_items) as booking_items_total_price,
  (select sum(deposit_amount) from bookings) as bookings_total_deposit,
  (select sum(deposit_amount) from booking_items) as booking_items_total_deposit;
-- expect bookings_total_price = booking_items_total_price, same for deposit

-- payments untouched
select count(*) from payments; -- expect same as Gate 0

-- NGJ-0001 spot-check — must match the Gate 0 snapshot field-for-field,
-- reached through the new join path
select bi.booking_id, b.booking_code, bi.type, bi.pickup_date, bi.return_date,
       bi.actual_return_date, bi.status, bi.price_charged, bi.deposit_amount,
       bi.deposit_collected, bi.deposit_refunded, bi.return_checklist, bi.return_notes,
       bi.custom_addons, i.item_code, i.name as item_name
from booking_items bi
join bookings b on b.id = bi.booking_id
join items i on i.id = bi.item_id
where i.name = 'Peacock Bridal Set' and i.item_code = 'NGJ-0001'
order by bi.pickup_date;

-- The _v2 views now return real data — sanity-check them directly, and
-- confirm they agree with the OLD views (still live under their permanent
-- names) for existing bookings, which today are all still single-item
-- families so the two should match exactly.
select * from booking_financials_v2 limit 5;
select * from overdue_rentals_v2 limit 5;
select * from upcoming_returns_v2 limit 5;
select * from booking_sequence_v2 limit 5;

-- booking_status_v2: every existing (single-item) booking should now read
-- as either 'active' (1 of 1 returned=false) or 'completed' (1 of 1
-- returned=true) — never 'cancelled', unless a real booking's underlying
-- item happens to be status='cancelled' today (check against Gate 0's own
-- status breakdown if this shows up)
select bs.computed_status, bs.active_item_count, bs.resolved_item_count, count(*)
from booking_status_v2 bs
group by bs.computed_status, bs.active_item_count, bs.resolved_item_count
order by 1;

select b.booking_code, old_bf.price_charged as old_price, v2_bf.price_charged as v2_price,
       old_bf.total_paid as old_paid, v2_bf.total_paid as v2_paid,
       old_bf.balance_due as old_balance, v2_bf.balance_due as v2_balance
from bookings b
join booking_financials old_bf on old_bf.booking_id = b.id
join booking_financials_v2 v2_bf on v2_bf.booking_id = b.id
where old_bf.price_charged <> v2_bf.price_charged
   or old_bf.total_paid <> v2_bf.total_paid
   or old_bf.balance_due <> v2_bf.balance_due;
-- expect zero rows — any row here means the new view disagrees with the
-- proven-correct old one for an existing booking; investigate before
-- building app code against _v2, let alone before cutover

-- ── GATE 2.5 — preview branch testing (not SQL) ──────────────────────────
-- Build the new backend routes/frontend against the _v2 views and
-- booking_items (never against the old bookings columns or old view
-- names), deploy to a Vercel preview branch, and exercise every flow
-- end-to-end there: booking creation, returns, dashboard, reports. The
-- live production app and its Vercel deployment stay on the old code path
-- and old views/columns, completely untouched, for the entire duration of
-- this testing. Do not proceed to 03_schema_cutover.sql until this is
-- signed off.

-- ============================================================
-- GATE 3 — after 03_schema_cutover.sql
-- ============================================================

-- Old columns are genuinely gone (this SELECT should error: column does not exist)
-- select item_id from bookings limit 1;

-- The _v2 names no longer exist — they were renamed, not duplicated
-- (each of these five SELECTs should error: relation does not exist)
-- select * from booking_financials_v2 limit 1;
-- select * from booking_sequence_v2 limit 1;
-- select * from overdue_rentals_v2 limit 1;
-- select * from upcoming_returns_v2 limit 1;
-- select * from booking_status_v2 limit 1;

-- The old booking_status ENUM TYPE is also gone (should error: type does not exist)
-- select 'booked'::booking_status;

-- booking_items row count is stable across the cutover (cutover doesn't
-- touch booking_items at all, but confirm nothing else silently changed it)
select count(*) from booking_items; -- expect same as Gate 2

-- The five views, now under their permanent names, come back non-empty and
-- structurally sane. These are literally the same view objects that were
-- already exercised as `_v2` during preview-branch testing (renamed, not
-- recreated), so this is a confirmation, not a first-time test.
select * from booking_financials limit 5;
select * from overdue_rentals limit 5;
select * from upcoming_returns limit 5;
select * from booking_sequence limit 5;
select * from booking_status limit 5;

-- payments still untouched
select count(*) from payments; -- expect same as Gate 0

-- Final NGJ-0001 check, now via the rebuilt booking_financials view --
-- price_charged here is the PARENT total, which for this item's real
-- booking(s) should equal the same price_charged captured at Gate 0/2
-- (since each legacy booking is currently a single-item family of one)
select b.booking_code, bf.price_charged, bf.total_paid, bf.balance_due
from bookings b
join booking_financials bf on bf.booking_id = b.id
where b.id in (
  select bi.booking_id from booking_items bi
  join items i on i.id = bi.item_id
  where i.item_code = 'NGJ-0001'
);
