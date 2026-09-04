-- Who physically collected a rental/sale item at pickup — recorded only
-- when Confirm Pickup is submitted (POST .../confirm-pickup), never
-- inferred or backfilled. 'self' needs no further detail (the customer is
-- already on the booking); 'family'/'porter' record who actually showed up
-- to collect it, since that's often someone other than the customer and
-- the shop wants a record of who to hold accountable if the item doesn't
-- come back correctly. Cleared by undo-pickup, same as actual_pickup_date.
create type pickup_person_type as enum ('self', 'family', 'porter');

alter table booking_items add column pickup_person_type pickup_person_type;
alter table booking_items add column pickup_person_name text;
alter table booking_items add column pickup_person_phone text;
