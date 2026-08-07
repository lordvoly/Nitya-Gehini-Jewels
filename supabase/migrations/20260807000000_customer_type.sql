-- Customer segmentation for Reports: separates genuine retail bookings
-- from influencer/MUA collaboration bookings. Single value per customer
-- (not a multi-tag set) — a customer is fundamentally one kind of
-- relationship to the shop, same modeling choice as items.category.
create type customer_type as enum ('regular', 'influencer', 'mua');

alter table customers add column customer_type customer_type not null default 'regular';
