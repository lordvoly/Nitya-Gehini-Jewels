-- booking_items.actual_pickup_date: same "planned vs. actual" pattern as
-- actual_return_date — nullable, no default, set only when an operator
-- explicitly confirms pickup (POST /api/bookings/:bookingId/items/:itemId/
-- confirm-pickup) rather than inferred from pickup_date vs today. Until
-- that endpoint is called, pickup_date-vs-today inference remains the
-- fallback everywhere this app shows availability — see itemsData.ts and
-- bookings.ts's attachChains()/pickup_overdue computation.
alter table booking_items add column actual_pickup_date date;
