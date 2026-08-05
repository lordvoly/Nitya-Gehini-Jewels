-- Item retirement: hide a damaged/discontinued piece from new bookings
-- while keeping its booking history fully intact. Items with booking
-- history can't be hard-deleted (the bookings.item_id FK blocks it, see
-- items.ts's DELETE handler) — retirement is the actual answer for that
-- case, but it's also a valid state for any item, not just ones blocked
-- from deletion. See PROJECT_PLAN_V2.md §3.
alter table items add column is_active boolean not null default true;

create index items_is_active_idx on items(is_active);
