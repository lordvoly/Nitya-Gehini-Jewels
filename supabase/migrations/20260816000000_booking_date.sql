-- bookings.booking_date: the date the booking was actually made, editable
-- by the operator (BookingForm at creation, EditBookingForm afterward) —
-- deliberately distinct from created_at, which stays an untouched system
-- timestamp and is never made user-editable. Backfilled from each existing
-- row's created_at (IST calendar date) since that's the closest available
-- approximation for bookings made before this column existed; every new
-- booking going forward defaults to ist_today() unless the operator
-- overrides it, same "defaults to today, but editable" pattern already
-- used by payments.payment_date.
alter table bookings add column booking_date date;
update bookings set booking_date = (created_at at time zone 'Asia/Kolkata')::date where booking_date is null;
alter table bookings alter column booking_date set not null;
alter table bookings alter column booking_date set default ist_today();

create index bookings_booking_date_idx on bookings(booking_date);

-- create_booking_with_items needs to accept and store booking_date too.
-- Postgres identifies a function by name + argument types, so adding a
-- parameter via plain `create or replace function` would leave the OLD
-- 8-arg signature sitting alongside a NEW 9-arg one as a separate overload
-- rather than truly replacing it — the old signature is dropped explicitly
-- first so there's exactly one version of this function, matching how
-- every other schema object in this app has exactly one live definition.
drop function if exists create_booking_with_items(text, uuid, boolean, text, text, numeric, uuid, jsonb);

create or replace function create_booking_with_items(
  p_booking_code text,
  p_customer_id uuid,
  p_gst_applicable boolean,
  p_gst_invoice_number text,
  p_hsn_code text,
  p_tax_rate numeric,
  p_created_by uuid,
  p_items jsonb,
  p_booking_date date default ist_today()
) returns bookings
language plpgsql
as $$
declare
  v_booking bookings;
  v_item jsonb;
  v_item_row items;
  v_type text;
  v_item_id uuid;
  v_qty integer;
  v_pickup date;
  v_return date;
  v_already_sold integer;
  v_already_reserved integer;
  v_available integer;
  v_conflict_count integer;
  v_dup_item_id uuid;
begin
  select (elem->>'item_id')::uuid into v_dup_item_id
  from jsonb_array_elements(p_items) as elem
  group by elem->>'item_id'
  having count(*) > 1
  limit 1;
  if v_dup_item_id is not null then
    raise exception 'Item % appears more than once in this booking', v_dup_item_id;
  end if;

  insert into bookings (
    booking_code, customer_id, gst_applicable, gst_invoice_number, hsn_code, tax_rate, created_by, booking_date
  ) values (
    p_booking_code, p_customer_id, p_gst_applicable, p_gst_invoice_number, p_hsn_code, p_tax_rate, p_created_by,
    coalesce(p_booking_date, ist_today())
  )
  returning * into v_booking;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_type := v_item->>'type';
    v_item_id := (v_item->>'item_id')::uuid;
    v_qty := coalesce((v_item->>'quantity_booked')::integer, 1);
    v_pickup := (v_item->>'pickup_date')::date;
    v_return := nullif(v_item->>'return_date', '')::date;

    select * into v_item_row from items where id = v_item_id;
    if not found then
      raise exception 'Item % not found', v_item_id;
    end if;

    if v_item_row.tracking_type = 'unique' then
      if v_item_row.status <> 'available' then
        raise exception 'Item % (%) is not available (status: %)',
          v_item_row.item_code, v_item_row.name, v_item_row.status;
      end if;

      if v_type = 'rental' then
        select count(*) into v_conflict_count
        from booking_items bi
        where bi.item_id = v_item_id
          and bi.type = 'rental'
          and bi.status in ('booked', 'out')
          and bi.pickup_date < v_return
          and bi.return_date > v_pickup;
        if v_conflict_count > 0 then
          raise exception 'Item % (%) is already booked for an overlapping date range',
            v_item_row.item_code, v_item_row.name;
        end if;
      end if;
    else
      select coalesce(sum(bi.quantity_booked), 0) into v_already_sold
      from booking_items bi
      where bi.item_id = v_item_id and bi.type = 'sale' and bi.status in ('booked', 'out');

      v_already_reserved := 0;
      if v_type = 'rental' then
        select coalesce(sum(bi.quantity_booked), 0) into v_already_reserved
        from booking_items bi
        where bi.item_id = v_item_id
          and bi.type = 'rental'
          and bi.status in ('booked', 'out')
          and bi.pickup_date < v_return
          and bi.return_date > v_pickup;
      end if;

      v_available := coalesce(v_item_row.quantity_on_hand, 0) - v_already_sold - v_already_reserved;
      if v_qty > v_available then
        raise exception 'Only % available for item % (%), requested %',
          greatest(v_available, 0), v_item_row.item_code, v_item_row.name, v_qty;
      end if;
    end if;

    insert into booking_items (
      booking_id, item_id, quantity_booked, type, pickup_date, return_date,
      price_charged, deposit_amount, deposit_collected, custom_addons
    ) values (
      v_booking.id,
      v_item_id,
      v_qty,
      v_type::booking_type,
      v_pickup,
      v_return,
      (v_item->>'price_charged')::numeric,
      coalesce((v_item->>'deposit_amount')::numeric, 0),
      coalesce((v_item->>'deposit_collected')::boolean, false),
      coalesce(v_item->'custom_addons', '[]'::jsonb)
    );

    if v_type = 'sale' and v_item_row.tracking_type = 'unique' then
      update items set status = 'sold' where id = v_item_id;
    end if;
  end loop;

  return v_booking;
end;
$$;
