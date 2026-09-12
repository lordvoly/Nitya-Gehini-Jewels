-- Cleans up a latent overload left behind by 20260912000000's
-- create-or-replace-with-a-new-trailing-param pattern. That pattern (used
-- safely for p_booking_date and earlier FOC-related additions too) assumes
-- CREATE OR REPLACE FUNCTION replaces the existing function outright — but
-- Postgres identifies a function by its argument *types*, not by name, so
-- adding one more parameter (even with a default) doesn't replace the old
-- signature, it adds a second overload alongside it. Confirmed live: calling
-- create_booking_with_items via PostgREST with the old 9-arg parameter set
-- (no p_notes) returned PGRST203, "Could not choose the best candidate
-- function", listing both the old 9-arg and new 10-arg versions as existing
-- simultaneously in the database.
--
-- This was NOT an active production bug — POST /api/bookings always calls
-- the RPC with p_notes explicitly included (even as null), which
-- unambiguously resolves to the 10-arg version — but it's a real footgun
-- left in the schema: any future caller that omits p_notes (a script, a
-- future tool, a manual RPC call) would hit the same ambiguity error this
-- migration's own verification run just did. Dropping the stale 9-arg
-- overload explicitly, rather than relying on future create-or-replace
-- calls to clean up after themselves (they won't — the same footgun would
-- just recur on the next added parameter).
drop function if exists create_booking_with_items(
  p_booking_code text,
  p_customer_id uuid,
  p_gst_applicable boolean,
  p_gst_invoice_number text,
  p_hsn_code text,
  p_tax_rate numeric,
  p_created_by uuid,
  p_items jsonb,
  p_booking_date date
);
