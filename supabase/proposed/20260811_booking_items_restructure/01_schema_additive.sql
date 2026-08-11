-- PROPOSED — not yet applied. See PROJECT_PLAN_V2.md §8.
--
-- Multi-item bookings restructuring — step 1 of 3 (additive, non-destructive).
-- Creates booking_items, the new per-item line table, AND the five new
-- computed views under temporary `_v2` names (booking_financials_v2,
-- booking_sequence_v2, overdue_rentals_v2, upcoming_returns_v2,
-- booking_status_v2) — a blue-green setup so new backend/frontend code can
-- be built and tested against real (post-backfill) data on a Vercel preview
-- branch while production keeps running unmodified against the OLD
-- `bookings` columns and the OLD `booking_financials`/`booking_sequence`/
-- `overdue_rentals`/`upcoming_returns` views the whole time. `bookings`
-- itself is left fully intact here — nothing is dropped or altered on it
-- yet. `booking_status_v2` has no OLD counterpart (status was never a
-- computed view before — it was just `bookings.status`, a stored column)
-- but it STILL can't be created under its final name yet: `booking_status`
-- is already taken by the enum type from the original schema
-- (`bookings.status booking_status`). See the note above that view's
-- definition below, and 03_schema_cutover.sql, which drops that now-orphaned
-- enum before renaming this view into its place.
--
-- The `_v2` views are plain (non-materialized) views, so they don't need
-- booking_items to have any data yet — they just re-run their query at read
-- time. Created here, in step 1, purely so they exist as soon as possible;
-- they'll show 0 rows (or, for booking_status_v2, one computed row per
-- EXISTING bookings parent with an all-zero fraction) until
-- 02_data_backfill.sql populates booking_items, with no further action
-- needed.
--
-- Run this, then 02_data_backfill.sql, verify (see verification_plan.sql),
-- build and test the new app code against the `_v2` views on a preview
-- branch, and only then 03_schema_cutover.sql (destructive — drops the
-- now-redundant columns from `bookings`, drops the OLD views, drops the
-- now-orphaned `booking_status` enum, and renames these `_v2` views into
-- their permanent names).

create type booking_item_status as enum ('booked', 'out', 'returned', 'cancelled');

create table booking_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  item_id uuid not null references items(id),
  quantity_booked integer not null default 1,
  type booking_type not null,
  pickup_date date not null,
  return_date date, -- required for rentals, enforced below
  actual_return_date date,
  status booking_item_status not null default 'booked',
  price_charged numeric not null, -- snapshot at booking time, same rule as bookings.price_charged before it
  deposit_amount numeric not null default 0,
  deposit_collected boolean not null default false,
  deposit_refunded boolean not null default false,
  deposit_refund_date date,
  return_checklist jsonb, -- populated from items.components + custom_addons at return time
  return_notes text, -- moved here from bookings: explains an incomplete checklist for THIS item,
                      -- which only makes sense per-item once a family booking can mix resolved and
                      -- unresolved items. Not listed in §8's original field table — see the note
                      -- added there when this proposal was written.
  custom_addons jsonb not null default '[]'::jsonb, -- free-text extras for this item, never written to items.components
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint return_date_required_for_rentals
    check (type = 'sale' or return_date is not null)
);

create index booking_items_booking_idx on booking_items(booking_id);
create index booking_items_item_idx on booking_items(item_id);
create index booking_items_status_idx on booking_items(status);
create index booking_items_return_date_idx on booking_items(return_date);

create trigger booking_items_set_updated_at before update on booking_items
  for each row execute function set_updated_at();

-- Same backstop-only RLS posture as every other table — the backend's
-- service-role key bypasses this; it exists purely in case a client ever
-- talks to Supabase directly.
alter table booking_items enable row level security;

-- ── New views (temporary `_v2` names) ───────────────────────────────────
-- Identical bodies to what will become the permanent booking_financials /
-- booking_sequence / overdue_rentals / upcoming_returns in
-- 03_schema_cutover.sql — that file does NOT recreate these; it just
-- renames them. Testing done now against the `_v2` names is exactly the
-- behavior the permanent names will have after cutover, byte for byte.

-- One running balance per PARENT booking (family transaction): sums
-- price_charged across every line item and every payment against that
-- booking. Matches §8's payments-stay-at-parent-level design — some
-- clients pay the whole family total upfront, others pay per item as it's
-- picked up, so a single balance across all items is the only shape that
-- supports both without tracking which payment applies to which item.
--
-- is_overdue / days_until_return are deliberately NOT carried over from the
-- old 1:1 booking_financials — overdue-ness is now inherently a per-item
-- concept (one line item in a family booking can be overdue while another
-- isn't), which a parent-level balance view can't express. That signal
-- lives in overdue_rentals_v2 below instead, at the booking_items grain.
--
-- BUG FIXED 2026-08-11 (found live during Checkpoint (a) HTTP testing, not
-- in review): the price_charged subquery originally summed EVERY
-- booking_items row regardless of status, including 'cancelled' ones — a
-- cancelled item never actually happened, same "cancelled = never
-- happened" principle applied everywhere else in this app (reports.ts's
-- revenue/counts, booking_status_v2's own item counts just below), but
-- this view was the one place that principle wasn't applied. Fixed with
-- `where status <> 'cancelled'` on the subquery.
create view booking_financials_v2 as
select
  b.id as booking_id,
  coalesce(bi.total_price, 0) as price_charged,
  coalesce(p.total_paid, 0) as total_paid,
  coalesce(bi.total_price, 0) - coalesce(p.total_paid, 0) as balance_due
from bookings b
left join (
  select booking_id, sum(price_charged) as total_price
  from booking_items
  where status <> 'cancelled'
  group by booking_id
) bi on bi.booking_id = b.id
left join (
  select booking_id, sum(amount) as total_paid
  from payments
  group by booking_id
) p on p.booking_id = b.id;

-- Per-item "when returns" sequence — same LEAD/LAG semantics as the old
-- booking_sequence, now partitioned over booking_items since item_id lives
-- there. The PK column is booking_item_id (not booking_id) since this now
-- identifies a line item, not a family transaction; booking_id is kept
-- alongside it so callers can still get back to the parent.
create view booking_sequence_v2 as
select
  bi.id as booking_item_id,
  bi.booking_id,
  bi.item_id,
  lag(bi.id) over w as prev_booking_item_id,
  lag(b.booking_code) over w as prev_booking_code,
  lag(cust.name) over w as prev_customer_name,
  lag(bi.pickup_date) over w as prev_pickup_date,
  lead(bi.id) over w as next_booking_item_id,
  lead(b.booking_code) over w as next_booking_code,
  lead(cust.name) over w as next_customer_name,
  lead(bi.pickup_date) over w as next_pickup_date
from booking_items bi
join bookings b on b.id = bi.booking_id
join customers cust on cust.id = b.customer_id
where bi.status <> 'cancelled'
window w as (partition by bi.item_id order by bi.pickup_date, bi.created_at);

-- Per-item overdue rentals, same filter logic as the old overdue_rentals,
-- now at the booking_items grain — a family booking with one overdue item
-- and one fine item correctly surfaces just the overdue one, which the old
-- parent-level view could never express.
--
-- FIX (caught while building this migration, verified against the actual
-- backend code, not assumed): filters on status IN ('booked', 'out'), NOT
-- status = 'out' alone. Grepping backend/src confirms 'out' is never once
-- written by any code path — booking creation's insert omits `status`
-- entirely (falls through to the column default, 'booked') and the only
-- place bookings.status is ever written anywhere in the app is the return
-- handler setting it to 'returned'. There is no check-in/"mark as out"
-- step. That means the OLD overdue_rentals/upcoming_returns (status =
-- 'out' only) have never matched a single real booking in production —
-- silently dead code, not a peripheral bug, since overdue detection is
-- this app's core purpose. A rental sitting between its pickup_date and
-- return_date is "out" in the real-world sense the operator cares about
-- regardless of which literal status string is stored, so booked/out are
-- both treated as "currently out" here rather than carrying the same
-- silent breakage forward into the new schema.
create view overdue_rentals_v2 as
select
  bi.*,
  b.booking_code,
  b.customer_id,
  bf.balance_due,
  (bi.return_date - ist_today()) as days_until_return,
  bs.next_booking_code,
  bs.next_customer_name,
  bs.next_pickup_date,
  (bs.next_pickup_date is not null and bs.next_pickup_date <= ist_today()) as next_customer_waiting
from booking_items bi
join bookings b on b.id = bi.booking_id
join booking_financials_v2 bf on bf.booking_id = b.id
left join booking_sequence_v2 bs on bs.booking_item_id = bi.id
where bi.type = 'rental'
  and bi.status in ('booked', 'out')
  and bi.return_date < ist_today();

-- Same booked/out fix as overdue_rentals_v2 above, same reason.
create view upcoming_returns_v2 as
select
  bi.*,
  b.booking_code,
  b.customer_id,
  bf.balance_due,
  (bi.return_date - ist_today()) as days_until_return
from booking_items bi
join bookings b on b.id = bi.booking_id
join booking_financials_v2 bf on bf.booking_id = b.id
where bi.type = 'rental'
  and bi.status in ('booked', 'out')
  and bi.return_date >= ist_today();

-- Parent-level computed booking status (decision B, §8) — never stored,
-- same rule as balance_due/overdue elsewhere in this app. Based on
-- non-cancelled booking_items only: a sale-type item is immediately
-- resolved (no return step applies to it); a rental-type item is resolved
-- once returned. active_item_count is the denominator and
-- resolved_item_count the numerator behind the "2 of 3 items returned"
-- style fraction the app shows for an Active booking — exposed here as raw
-- counts, not a pre-built string, so formatting stays an app-layer concern
-- (matches every other view in this file: compute the numbers, format at
-- the edge).
--
-- computed_status priority, matching decision B exactly:
--   1. active_item_count = 0 (every item cancelled, or — a defensive edge
--      that shouldn't happen in practice — a booking with zero
--      booking_items rows at all) -> 'cancelled'
--   2. otherwise, if there's no non-cancelled rental item still
--      booked/out (covers BOTH "all rentals returned" and "no rental
--      items exist at all", e.g. an all-sale family booking) -> 'completed'
--   3. otherwise (at least one rental item still booked/out) -> 'active'
--
-- NAMING NOTE: this view is created as booking_status_v2, not
-- booking_status, because booking_status is already taken — by the ENUM
-- TYPE from the original schema (bookings.status booking_status). A view
-- and a type can't share a name in the same Postgres schema. Once
-- bookings.status (the last remaining user of that enum) is dropped in
-- 03_schema_cutover.sql, the enum itself is also dropped there as cleanup,
-- freeing the name for this view to be renamed into.
create view booking_status_v2 as
select
  b.id as booking_id,
  count(bi.id) filter (where bi.status <> 'cancelled') as active_item_count,
  count(bi.id) filter (
    where bi.status <> 'cancelled' and (bi.type = 'sale' or bi.status = 'returned')
  ) as resolved_item_count,
  case
    when count(bi.id) filter (where bi.status <> 'cancelled') = 0 then 'cancelled'
    when count(bi.id) filter (
      where bi.status <> 'cancelled' and bi.type = 'rental' and bi.status <> 'returned'
    ) = 0 then 'completed'
    else 'active'
  end as computed_status
from bookings b
left join booking_items bi on bi.booking_id = b.id
group by b.id;
