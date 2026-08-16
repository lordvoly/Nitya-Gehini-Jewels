import { supabase } from "./supabase.js";
import { ACTIVE_STATUSES } from "../routes/bookings.js";
import { istToday } from "./dates.js";

// Neither of these is a stored column — a unique item's own `status` is
// deliberately never flipped to 'rented_out' on rental creation or on
// pickup confirmation (see the long comments above POST /api/bookings and
// POST .../confirm-pickup in routes/bookings.ts), so all three have to be
// computed live from booking_items, same as everything else this app
// treats as a live/computed value rather than a written-to field.
//
// Since Confirm Pickup (POST /api/bookings/:bookingId/items/:itemId/
// confirm-pickup), a booking_item's status genuinely can reach 'out' —
// an explicit, real event, not inference. currentlyOut now means exactly
// that: status = 'out'. Anything still 'booked' whose pickup_date has
// already passed — the exact case pure date-inference used to silently
// fold into "out" — is its own separate bucket, pickupOverdue, so it can
// be surfaced as a distinct "needs a look" state instead of looking
// identical to a genuinely-confirmed pickup. upcomingBooked is unchanged:
// still 'booked', pickup_date still in the future. One query, partitioned
// by status then date, rather than several near-identical ones.
export interface ItemAvailability {
  currentlyOut: Set<string>;
  pickupOverdue: Set<string>;
  upcomingBooked: Set<string>;
}

export async function getItemAvailability(): Promise<ItemAvailability> {
  const { data, error } = await supabase
    .from("booking_items")
    .select("item_id, pickup_date, status")
    .eq("type", "rental")
    .in("status", ACTIVE_STATUSES);
  if (error) throw error;

  const today = istToday();
  const currentlyOut = new Set<string>();
  const pickupOverdue = new Set<string>();
  const upcomingBooked = new Set<string>();
  for (const row of data ?? []) {
    if (row.status === "out") {
      currentlyOut.add(row.item_id);
    } else if (row.pickup_date <= today) {
      pickupOverdue.add(row.item_id);
    } else {
      upcomingBooked.add(row.item_id);
    }
  }
  return { currentlyOut, pickupOverdue, upcomingBooked };
}
