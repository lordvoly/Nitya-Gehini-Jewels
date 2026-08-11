-- PROPOSED — acceptance-test scenarios for the booking_items restructuring.
-- Not a migration. Run these once both Stage 1 (additive + backfill) and
-- Stage 2 (cutover) are live, against the PERMANENT view/table names
-- (booking_sequence, booking_status). During Stage 1 preview-branch
-- testing, the same scripts work unchanged except substituting the `_v2`
-- suffix on booking_sequence/booking_status (booking_items and bookings
-- are real tables either way, not renamed).
--
-- Both scenarios use throwaway ZZTEST-prefixed customers/items, wrapped so
-- cleanup runs even if you stop partway through — if anything looks wrong
-- at a CHECK step, stop and investigate BEFORE running the DELETE cleanup
-- at the end, so the bad state is still there to inspect. Neither scenario
-- touches the real Peacock Bridal Set (NGJ-0001) or any other real row.

-- ============================================================
-- SCENARIO A — "When Returns" out-of-order creation
-- ============================================================
-- Your dad's scenario: create booking B (15/08-18/08), then C
-- (19/08-21/08), then — created LAST but dated EARLIEST — A
-- (13/08-14/08). booking_sequence must order the chain by pickup_date
-- (A -> B -> C), not creation order. Then cancel B and confirm the chain
-- closes the gap (A -> C) with no dangling reference to the cancelled row.

begin;

insert into customers (id, name, phone, customer_type)
values ('a1000000-0000-0000-0000-0000000000a1', 'ZZTEST When-Returns Customer', '9990000001', 'regular');

insert into items (id, item_code, name, category, item_type, tracking_type, status, rental_price)
values ('a2000000-0000-0000-0000-0000000000a2', 'ZZTEST-WR-01', 'ZZTEST When-Returns Item', 'Other', 'single', 'unique', 'available', 5000);

-- Booking B — created FIRST, dated 15/08-18/08
insert into bookings (id, booking_code, customer_id)
values ('b0000000-0000-0000-0000-00000000000b', 'BK-ZZTEST-B', 'a1000000-0000-0000-0000-0000000000a1');
insert into booking_items (booking_id, item_id, type, pickup_date, return_date, price_charged)
values ('b0000000-0000-0000-0000-00000000000b', 'a2000000-0000-0000-0000-0000000000a2', 'rental', '2026-08-15', '2026-08-18', 5000);

-- Booking C — created SECOND, dated 19/08-21/08
insert into bookings (id, booking_code, customer_id)
values ('c0000000-0000-0000-0000-00000000000c', 'BK-ZZTEST-C', 'a1000000-0000-0000-0000-0000000000a1');
insert into booking_items (booking_id, item_id, type, pickup_date, return_date, price_charged)
values ('c0000000-0000-0000-0000-00000000000c', 'a2000000-0000-0000-0000-0000000000a2', 'rental', '2026-08-19', '2026-08-21', 5000);

-- Booking A — created LAST, but dated EARLIEST, 13/08-14/08
insert into bookings (id, booking_code, customer_id)
values ('a0000000-0000-0000-0000-00000000000a', 'BK-ZZTEST-A', 'a1000000-0000-0000-0000-0000000000a1');
insert into booking_items (booking_id, item_id, type, pickup_date, return_date, price_charged)
values ('a0000000-0000-0000-0000-00000000000a', 'a2000000-0000-0000-0000-0000000000a2', 'rental', '2026-08-13', '2026-08-14', 5000);

commit;

-- CHECK A1 — chain must read A -> B -> C by pickup_date, NOT creation order
-- (creation order was B, C, A — if this instead read B -> C -> A, or
-- showed A with no next_booking_code, the view is sorting by created_at
-- instead of pickup_date and something is wrong)
select bi.id as booking_item_id, b.booking_code, bi.pickup_date,
       bs.prev_booking_code, bs.next_booking_code
from booking_items bi
join bookings b on b.id = bi.booking_id
join booking_sequence bs on bs.booking_item_id = bi.id
where bi.item_id = 'a2000000-0000-0000-0000-0000000000a2'
order by bi.pickup_date;
-- Expect exactly:
--   BK-ZZTEST-A (13-14): prev_booking_code = null,          next_booking_code = 'BK-ZZTEST-B'
--   BK-ZZTEST-B (15-18): prev_booking_code = 'BK-ZZTEST-A',  next_booking_code = 'BK-ZZTEST-C'
--   BK-ZZTEST-C (19-21): prev_booking_code = 'BK-ZZTEST-B',  next_booking_code = null

-- Cancel B
update booking_items set status = 'cancelled'
where booking_id = 'b0000000-0000-0000-0000-00000000000b';

-- CHECK A2 — chain must now read A -> C directly, no gap; B is excluded
-- from booking_sequence entirely (cancelled rows are filtered out of the
-- view, not just skipped over)
select bi.id as booking_item_id, b.booking_code, bi.pickup_date, bi.status,
       bs.prev_booking_code, bs.next_booking_code
from booking_items bi
join bookings b on b.id = bi.booking_id
left join booking_sequence bs on bs.booking_item_id = bi.id
where bi.item_id = 'a2000000-0000-0000-0000-0000000000a2'
order by bi.pickup_date;
-- Expect exactly:
--   BK-ZZTEST-A (13-14): status='booked',    prev = null,   next = 'BK-ZZTEST-C'  <- re-linked past the cancelled row
--   BK-ZZTEST-B (15-18): status='cancelled', prev = null,   next = null            <- no row in booking_sequence at all (left join finds nothing)
--   BK-ZZTEST-C (19-21): status='booked',    prev = 'BK-ZZTEST-A', next = null

-- Cleanup
delete from booking_items where item_id = 'a2000000-0000-0000-0000-0000000000a2';
delete from bookings where id in (
  'a0000000-0000-0000-0000-00000000000a',
  'b0000000-0000-0000-0000-00000000000b',
  'c0000000-0000-0000-0000-00000000000c'
);
delete from items where id = 'a2000000-0000-0000-0000-0000000000a2';
delete from customers where id = 'a1000000-0000-0000-0000-0000000000a1';


-- ============================================================
-- SCENARIO B — real multi-item booking, independent returns, status rollup
-- ============================================================
-- One family booking (BK-ZZTEST-MULTI) with 3 rental items on different
-- return dates. Confirms: (a) each item returns independently without
-- affecting the other two, (b) booking_status reads the exact "2 of 3
-- items returned" fraction partway through, (c) status flips to Completed
-- only once ALL non-cancelled rental items are returned, not before.

begin;

insert into customers (id, name, phone, customer_type)
values ('b1000000-0000-0000-0000-0000000000b1', 'ZZTEST Multi-Item Customer', '9990000002', 'regular');

insert into items (id, item_code, name, category, item_type, tracking_type, status, rental_price) values
  ('b2000000-0000-0000-0000-0000000000b2', 'ZZTEST-MI-01', 'ZZTEST Multi Item A', 'Other', 'single', 'unique', 'available', 3000),
  ('b3000000-0000-0000-0000-0000000000b3', 'ZZTEST-MI-02', 'ZZTEST Multi Item B', 'Other', 'single', 'unique', 'available', 4000),
  ('b4000000-0000-0000-0000-0000000000b4', 'ZZTEST-MI-03', 'ZZTEST Multi Item C', 'Other', 'single', 'unique', 'available', 5000);

insert into bookings (id, booking_code, customer_id)
values ('b5000000-0000-0000-0000-0000000000b5', 'BK-ZZTEST-MULTI', 'b1000000-0000-0000-0000-0000000000b1');

insert into booking_items (booking_id, item_id, type, pickup_date, return_date, price_charged) values
  ('b5000000-0000-0000-0000-0000000000b5', 'b2000000-0000-0000-0000-0000000000b2', 'rental', '2026-08-15', '2026-08-17', 3000),
  ('b5000000-0000-0000-0000-0000000000b5', 'b3000000-0000-0000-0000-0000000000b3', 'rental', '2026-08-15', '2026-08-19', 4000),
  ('b5000000-0000-0000-0000-0000000000b5', 'b4000000-0000-0000-0000-0000000000b4', 'rental', '2026-08-15', '2026-08-21', 5000);

commit;

-- CHECK B1 — all 3 still out, status Active, 0 of 3 resolved
select booking_id, computed_status, resolved_item_count, active_item_count
from booking_status where booking_id = 'b5000000-0000-0000-0000-0000000000b5';
-- Expect: computed_status='active', resolved_item_count=0, active_item_count=3

-- Return item A only (the 15-17 item)
update booking_items set status = 'returned', actual_return_date = '2026-08-17'
where booking_id = 'b5000000-0000-0000-0000-0000000000b5'
  and item_id = 'b2000000-0000-0000-0000-0000000000b2';

-- CHECK B2 — still Active, now "1 of 3"; items B and C untouched
select booking_id, computed_status, resolved_item_count, active_item_count
from booking_status where booking_id = 'b5000000-0000-0000-0000-0000000000b5';
-- Expect: active, 1, 3

select item_id, status, actual_return_date
from booking_items where booking_id = 'b5000000-0000-0000-0000-0000000000b5' order by item_id;
-- Expect: item A ('b2...') returned with actual_return_date=2026-08-17;
-- items B and C ('b3...'/'b4...') still status='booked', actual_return_date=null
-- — confirms returning one item does NOT affect the others' state

-- Return item B (the 15-19 item)
update booking_items set status = 'returned', actual_return_date = '2026-08-19'
where booking_id = 'b5000000-0000-0000-0000-0000000000b5'
  and item_id = 'b3000000-0000-0000-0000-0000000000b3';

-- CHECK B3 — Active, "2 of 3 items returned" — the exact scenario named in the task
select booking_id, computed_status, resolved_item_count, active_item_count
from booking_status where booking_id = 'b5000000-0000-0000-0000-0000000000b5';
-- Expect: active, 2, 3

-- Return the last item, C (the 15-21 item)
update booking_items set status = 'returned', actual_return_date = '2026-08-21'
where booking_id = 'b5000000-0000-0000-0000-0000000000b5'
  and item_id = 'b4000000-0000-0000-0000-0000000000b4';

-- CHECK B4 — all 3 resolved, status flips to Completed
select booking_id, computed_status, resolved_item_count, active_item_count
from booking_status where booking_id = 'b5000000-0000-0000-0000-0000000000b5';
-- Expect: completed, 3, 3

-- Cleanup
delete from booking_items where booking_id = 'b5000000-0000-0000-0000-0000000000b5';
delete from bookings where id = 'b5000000-0000-0000-0000-0000000000b5';
delete from items where id in (
  'b2000000-0000-0000-0000-0000000000b2',
  'b3000000-0000-0000-0000-0000000000b3',
  'b4000000-0000-0000-0000-0000000000b4'
);
delete from customers where id = 'b1000000-0000-0000-0000-0000000000b1';
