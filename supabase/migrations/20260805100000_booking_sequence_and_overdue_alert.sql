-- "When Returns" chain — for any item, which booking comes next/previous
-- in the pickup-date sequence for that same item_id. Fully computed via
-- LEAD/LAG at query time — never stored — so it can never go stale when a
-- booking's dates change or it's edited/cancelled later. Cancelled
-- bookings are excluded from the sequence entirely (they never actually
-- occupied the item, so they must never appear as anyone's neighbor, and
-- excluding them means a cancellation automatically re-links its former
-- neighbors to each other on the next read, no cleanup required).
--
-- Meaningful mainly for `unique` items, where there's a real physical
-- hand-off between consecutive bookings — the app decides whether to
-- surface it based on items.tracking_type; the view itself doesn't filter
-- by tracking_type, since computing it is harmless either way.
create view booking_sequence as
select
  b.id as booking_id,
  b.item_id,
  lag(b.id) over w as prev_booking_id,
  lag(b.booking_code) over w as prev_booking_code,
  lag(cust.name) over w as prev_customer_name,
  lag(b.pickup_date) over w as prev_pickup_date,
  lead(b.id) over w as next_booking_id,
  lead(b.booking_code) over w as next_booking_code,
  lead(cust.name) over w as next_customer_name,
  lead(b.pickup_date) over w as next_pickup_date
from bookings b
join customers cust on cust.id = b.customer_id
where b.status <> 'cancelled'
window w as (partition by b.item_id order by b.pickup_date, b.created_at);

-- Extends overdue_rentals (create-or-replace, purely additive columns) with
-- the "next customer is waiting on this exact item" signal: an overdue
-- booking whose next-in-line booking, per booking_sequence, is due to pick
-- up today or already in the past. Distinct, higher-urgency case from a
-- plain overdue rental with nobody waiting — callers can filter/sort on
-- next_customer_waiting rather than this being folded silently into the
-- rest of the overdue list.
create or replace view overdue_rentals as
select
  b.*,
  bf.balance_due,
  bf.days_until_return,
  bs.next_booking_code,
  bs.next_customer_name,
  bs.next_pickup_date,
  (bs.next_pickup_date is not null and bs.next_pickup_date <= ist_today()) as next_customer_waiting
from bookings b
join booking_financials bf on bf.booking_id = b.id
left join booking_sequence bs on bs.booking_id = b.id
where b.type = 'rental'
  and b.status = 'out'
  and b.return_date < ist_today();
