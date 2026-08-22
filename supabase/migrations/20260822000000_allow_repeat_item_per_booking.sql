-- Allows the same physical item to appear more than once in one family
-- booking, as separate non-overlapping cycles (e.g. rented 22-28 Aug, then
-- again 7-9 Sep, in the same transaction). Was blocked purely by this
-- function's own explicit duplicate-item_id rejection below — a check
-- that (per PROJECT_PLAN_V2.md §8's original blast-radius notes) was
-- flagged as an open risk from the very first draft of this RPC, never a
-- deliberate restriction: "worth a quick sanity check once multi-item
-- creation exists, since nothing currently prevents adding the same
-- item_id twice to one booking."
--
-- Removing it is safe on its own: the per-item loop below already checks
-- each item against the LIVE booking_items table state, which includes
-- rows inserted earlier in this same loop/transaction (Postgres reads its
-- own uncommitted writes within one transaction) — so two entries for the
-- same item_id already correctly conflict-check against each other via
-- the existing pickup_date/return_date overlap query, exactly like they
-- would against any other real booking. Two non-overlapping cycles pass
-- through cleanly; two overlapping ones still correctly raise the
-- existing "already booked for an overlapping date range" exception.
-- Confirmed empirically before writing this migration, not assumed.
--
-- Same 9-arg signature as the previous version — only the duplicate-check
-- block and its now-unused v_dup_item_id declaration are removed.
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
begin
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
      price_charged, deposit_amount, deposit_collected, custom_addons, is_foc
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
      coalesce(v_item->'custom_addons', '[]'::jsonb),
      coalesce((v_item->>'is_foc')::boolean, false)
    );

    if v_type = 'sale' and v_item_row.tracking_type = 'unique' then
      update items set status = 'sold' where id = v_item_id;
    end if;
  end loop;

  return v_booking;
end;
$$;
