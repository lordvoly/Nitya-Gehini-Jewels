-- PROPOSED — not yet applied. See PROJECT_PLAN_V2.md §8, decision 1.
--
-- Multi-item bookings restructuring — the transactional RPC backing the new
-- POST /api/bookings. A single PL/pgSQL function body is one atomic Postgres
-- transaction by default (no explicit BEGIN/COMMIT needed) — this is what
-- gives real cross-table atomicity across the parent bookings insert and
-- every booking_items insert, replacing the earlier insert-then-
-- compensating-delete draft.
--
-- REVISION beyond what §8 originally described: this function does NOT just
-- blindly insert. It re-runs the same per-item conflict checks
-- backend/src/routes/bookings.ts's POST / handler already does today (unique
-- item must be 'available', no overlapping active rental; quantity item must
-- not be oversold) — matching that logic line for line — and RAISEs an
-- exception the instant any item fails, which aborts the ENTIRE transaction:
-- the parent row and every booking_items row already inserted earlier in the
-- same call are all rolled back, not just the failing item skipped. The
-- application layer's own pre-write conflict check (§8 decision 1) still
-- runs first, as a fast-fail before ever calling this function — this is a
-- second, transaction-safe layer of the same check, not a replacement for
-- it, and it closes the small check-then-write race window §8 originally
-- said would remain: the check and the write can no longer be split by a
-- concurrent request, because they now happen inside the same transaction.
--
-- p_items shape (jsonb array), one element per line item:
--   { "type": "rental"|"sale", "item_id": uuid, "quantity_booked": int,
--     "pickup_date": "YYYY-MM-DD", "return_date": "YYYY-MM-DD"|null,
--     "price_charged": numeric, "deposit_amount": numeric,
--     "deposit_collected": boolean, "custom_addons": [string, ...] }

create or replace function create_booking_with_items(
  p_booking_code text,
  p_customer_id uuid,
  p_gst_applicable boolean,
  p_gst_invoice_number text,
  p_hsn_code text,
  p_tax_rate numeric,
  p_created_by uuid,
  p_items jsonb
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
    booking_code, customer_id, gst_applicable, gst_invoice_number, hsn_code, tax_rate, created_by
  ) values (
    p_booking_code, p_customer_id, p_gst_applicable, p_gst_invoice_number, p_hsn_code, p_tax_rate, p_created_by
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
        -- Strict inequality, same same-day-turnover allowance as the
        -- existing app logic (not reproduced as a warning here — the RPC
        -- only needs to decide reject-or-not; the app layer still computes
        -- the non-blocking warning separately before calling this function).
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

    -- Same side effect as today's app code: a unique item's sale is
    -- permanent, so it flips to 'sold'. A unique item's rental deliberately
    -- does NOT flip item status (see the long comment in bookings.ts) — a
    -- unique item can have several legitimate non-overlapping future
    -- rentals, so per-booking status (booking_items.status), not
    -- items.status, is what tracks whether it's currently out.
    if v_type = 'sale' and v_item_row.tracking_type = 'unique' then
      update items set status = 'sold' where id = v_item_id;
    end if;
  end loop;

  return v_booking;
end;
$$;
