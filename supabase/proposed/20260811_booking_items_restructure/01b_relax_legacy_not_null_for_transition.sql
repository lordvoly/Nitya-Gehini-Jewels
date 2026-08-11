-- PROPOSED — not yet applied. See PROJECT_PLAN_V2.md §8.
--
-- Multi-item bookings restructuring — additive follow-up to 01/02, required
-- before Checkpoint (a) backend testing can begin (see §8's application-code
-- migration plan, decision 1).
--
-- The new POST /api/bookings will insert a parent-only bookings row
-- (customer_id, gst fields — nothing else) via the new
-- create_booking_with_items(...) transactional RPC. Pre-cutover, `bookings`
-- still carries its OLD single-item NOT NULL columns (item_id, type,
-- pickup_date, price_charged) — a parent-only insert would fail those
-- constraints until 03_schema_cutover.sql finally drops the columns
-- entirely, which can't happen until AFTER this application code is built
-- and tested on the preview branch. Relaxing (not removing) just these four
-- constraints resolves the chicken-and-egg: the still-live production code
-- path always supplies all four values anyway, so relaxing a constraint it
-- was already satisfying has zero effect on it. Purely additive/reversible —
-- 03_schema_cutover.sql drops these columns outright regardless, so nothing
-- here ever needs to be undone.
--
-- Columns NOT included here because they're already nullable or already
-- have a default (no change needed): quantity_booked (default 1),
-- return_date (nullable — sales never had one), actual_return_date,
-- status (default 'booked'), deposit_amount (default 0), deposit_collected/
-- deposit_refunded (default false), deposit_refund_date, gst_invoice_number,
-- hsn_code, tax_rate, return_checklist, return_notes, custom_addons
-- (default '[]').

alter table bookings
  alter column item_id drop not null,
  alter column type drop not null,
  alter column pickup_date drop not null,
  alter column price_charged drop not null;
