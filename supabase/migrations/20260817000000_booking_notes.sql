-- bookings.notes: free-text internal note on the parent transaction (e.g.
-- "shop owes customer ₹500 separately from their balance" — see CLAUDE.md).
-- Deliberately separate from booking_items.return_notes (which explains one
-- item's incomplete return checklist) and from payments.notes (one payment's
-- own note) — this is a whole-transaction note, not tied to any single item
-- or payment, and must stay editable regardless of computed_status (Booked/
-- Out/Completed/Cancelled), unlike return_notes which only makes sense once
-- an item has actually been returned.
--
-- notes_updated_at is a separate lightweight "last touched" timestamp, not
-- reused from the generic updated_at column — bookings_set_updated_at (see
-- 20260804000000_init_schema.sql) fires on ANY column change (GST fields,
-- booking_date, etc.), so updated_at alone can't answer "when was the note
-- last edited". Not a full audit log, just the one timestamp the task asked
-- for. Set explicitly by the application on every notes edit, not by a
-- trigger, since it should only move when the note itself changes.
alter table bookings add column notes text;
alter table bookings add column notes_updated_at timestamptz;
