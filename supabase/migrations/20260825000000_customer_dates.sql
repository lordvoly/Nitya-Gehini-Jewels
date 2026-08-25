-- Customer Date of Birth + Wedding Date — optional reference fields, never
-- collected before this feature, so no backfill is needed: both columns
-- are nullable with no default, and every existing row simply gets NULL.
--
-- Plain `date`, not `timestamptz` — these are calendar dates the operator
-- enters directly (a birthday, a wedding date), not moments in time to
-- convert between timezones, same typing already used for every other
-- pure-calendar-date column in this schema (bookings.booking_date,
-- booking_items.pickup_date/return_date, etc. — see CLAUDE.md's IST rule).
alter table customers add column date_of_birth date;
alter table customers add column date_of_wedding date;
