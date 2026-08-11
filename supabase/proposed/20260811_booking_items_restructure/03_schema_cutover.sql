-- PROPOSED — not yet applied. See PROJECT_PLAN_V2.md §8.
--
-- Multi-item bookings restructuring — step 3 of 3 (DESTRUCTIVE cutover).
-- Run ONLY after 01_schema_additive.sql and 02_data_backfill.sql have both
-- been applied AND verified (see verification_plan.sql), AND the new
-- backend/frontend code has already been built and tested end-to-end
-- against the `_v2` views on a preview branch — this drops columns with no
-- way to recover the data except from a database backup.
--
-- This step does NOT recreate booking_financials/booking_sequence/
-- overdue_rentals/upcoming_returns/booking_status from scratch — those
-- already exist (as `_v2`) with exactly the right definitions, already
-- exercised against real backfilled data during the preview-branch testing
-- period. This step just drops the old (`bookings`-column-based) versions
-- and RENAMES the `_v2` views into the now-vacated permanent names — a
-- rename doesn't touch the view's underlying dependencies (Postgres tracks
-- those by OID, not name), so overdue_rentals_v2/upcoming_returns_v2's
-- internal joins to booking_financials_v2/booking_sequence_v2 keep working
-- transparently through the rename regardless of order.
--
-- booking_status_v2 needs one extra step first: its permanent name,
-- booking_status, is occupied by the ENUM TYPE of that name from the
-- original schema (bookings.status's type) until bookings.status itself is
-- dropped below — a view can't share a name with a type in the same
-- schema. Once the column's gone, that enum has no remaining users, so
-- it's dropped here too, freeing the name.
--
-- Every app route/component that reads bookings.item_id / .type / .status /
-- .pickup_date / .return_date / .price_charged / etc. breaks the moment
-- this runs. Application code (backend/src/routes/bookings.ts,
-- dashboard.ts, reports.ts, items.ts, tools/index.ts; frontend
-- lib/bookings.ts, BookingForm.tsx, BookingsList.tsx, BookingDetail.tsx,
-- ReturnForm.tsx, lib/dashboard.ts, DashboardPage.tsx, lib/reports.ts,
-- ReportsPage.tsx — see §8's "full blast radius" list), already built and
-- tested against `_v2` on the preview branch, must be deployed together
-- with this migration — that's the "one deliberate moment" this two-phase
-- design is for.

begin;

-- Old views depending on the columns being dropped must go first —
-- Postgres won't allow ALTER TABLE ... DROP COLUMN while a view still
-- references that column, even indirectly through another view. This does
-- NOT touch the `_v2` views — different objects, same target names freed
-- up for the rename below.
drop view if exists overdue_rentals;
drop view if exists upcoming_returns;
drop view if exists booking_financials;
drop view if exists booking_sequence;

alter table bookings
  drop constraint if exists return_date_required_for_rentals,
  drop constraint if exists gst_invoice_only_when_applicable;

alter table bookings
  drop column item_id,
  drop column quantity_booked,
  drop column type,
  drop column pickup_date,
  drop column return_date,
  drop column actual_return_date,
  drop column status,
  drop column price_charged,
  drop column deposit_amount,
  drop column deposit_collected,
  drop column deposit_refunded,
  drop column deposit_refund_date,
  drop column return_checklist,
  drop column return_notes,
  drop column custom_addons;

-- gst_applicable / gst_invoice_number stay on bookings (whole-transaction
-- level, per §8 assumption 2) — re-add the constraint linking them, since
-- dropping+recreating the table-level constraint set above was the
-- simplest way to guarantee no stale constraint referencing a dropped
-- column survives.
alter table bookings
  add constraint gst_invoice_only_when_applicable
    check (gst_applicable or gst_invoice_number is null);

-- Now-orphaned: bookings.status (just dropped above) was the only column
-- ever typed booking_status. Dropping it frees the name for the
-- booking_status_v2 -> booking_status rename below.
drop type if exists booking_status;

-- ── Promote the already-tested `_v2` views to their permanent names ─────
alter view booking_financials_v2 rename to booking_financials;
alter view booking_sequence_v2 rename to booking_sequence;
alter view overdue_rentals_v2 rename to overdue_rentals;
alter view upcoming_returns_v2 rename to upcoming_returns;
alter view booking_status_v2 rename to booking_status;

commit;
