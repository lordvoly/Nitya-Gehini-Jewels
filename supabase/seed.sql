-- Local dev seed data. Not applied in production.
-- Run via `supabase db reset` (applies migrations, then this file) when developing locally.

insert into customers (name, phone, email) values
  ('Test Customer', '9999999999', 'test@example.com');

insert into items (item_code, name, category, item_type, components, tracking_type, status, rental_price, security_deposit_default, current_location)
values
  ('NGJ-0001', 'Peacock Bridal Set', 'Bridal Set', 'set',
   '["Necklace", "Earrings", "Tika", "Bangles"]', 'unique', 'available', 5000, 10000, 'Display Case 1');
