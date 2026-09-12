-- Lets a booking's Notes (bookings.notes, added in 20260817000000) be
-- entered while CREATING the booking, not only afterward via
-- PATCH /api/bookings/:id (BookingDetail's existing Add/Edit Notes) —
-- previously the create_booking_with_items RPC always inserted notes as
-- null. Same additive-parameter pattern already used for
-- p_booking_date/p_gst_* before it: p_notes is appended last with a
-- default so any existing caller that doesn't pass it keeps working
-- unchanged. Same 9-arg-plus-p_booking_date signature as
-- 20260822000000_allow_repeat_item_per_booking.sql — only the notes
-- handling is new.
create or replace function create_booking_with_items(
  p_booking_code text,
  p_customer_id uuid,
  p_gst_applicable boolean,
  p_gst_invoice_number text,
  p_hsn_code text,
  p_tax_rate numeric,
  p_created_by uuid,
  p_items jsonb,
  p_booking_date date default ist_today(),
  p_notes text default null
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
  -- Mirrors the PATCH /api/bookings/:id handler's own
  -- `notes.trim() ? notes : null` — an empty/whitespace-only note is
  -- stored as no note at all, not as an empty string.
  v_notes text := nullif(trim(p_notes), '');
begin
  insert into bookings (
    booking_code, customer_id, gst_applicable, gst_invoice_number, hsn_code, tax_rate, created_by, booking_date,
    notes, notes_updated_at
  ) values (
    p_booking_code, p_customer_id, p_gst_applicable, p_gst_invoice_number, p_hsn_code, p_tax_rate, p_created_by,
    coalesce(p_booking_date, ist_today()),
    v_notes,
    -- notes_updated_at should only move when the note itself changes (see
    -- 20260817000000's own reasoning) — a booking created with no note
    -- given has never had one set, so this stays null rather than "now".
    case when v_notes is not null then now() else null end
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
