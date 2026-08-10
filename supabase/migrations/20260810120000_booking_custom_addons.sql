-- Free-text extra items an operator adds during booking creation (e.g. a
-- borrowed pouch, a one-off accessory) — separate from and never modifying
-- the item's own components template (items.components). Combined with
-- components (for set items) into the return checklist at return time; see
-- POST /api/bookings/:id/return in backend/src/routes/bookings.ts.
alter table bookings add column custom_addons jsonb not null default '[]'::jsonb;
