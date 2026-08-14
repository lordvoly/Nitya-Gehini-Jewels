import { supabase } from "./supabase.js";
import { ACTIVE_STATUSES } from "../routes/bookings.js";
import { istToday } from "./dates.js";

// Neither of these is a stored column — a unique item's own `status` is
// deliberately never flipped to 'rented_out' on rental creation (see the
// long comment above POST /api/bookings in routes/bookings.ts), so both
// have to be computed live from booking_items, same as everything else
// this app treats as a live/computed value rather than a written-to field.
//
// A booking_item's own status only ever moves 'booked' -> 'returned' (or
// 'cancelled') in this app — nothing anywhere sets it to 'out'. That status
// value exists in the schema but no code path ever transitions to it (no
// "confirm pickup" step exists). So `status in ACTIVE_STATUSES` alone can't
// tell "reserved for later" apart from "out right now" — pickup_date vs
// today is what actually does: currentlyOut is an active rental whose
// pickup day has already arrived; upcomingBooked is one that hasn't yet.
// One query, partitioned by date, rather than two near-identical ones.
export interface ItemAvailability {
  currentlyOut: Set<string>;
  upcomingBooked: Set<string>;
}

export async function getItemAvailability(): Promise<ItemAvailability> {
  const { data, error } = await supabase
    .from("booking_items")
    .select("item_id, pickup_date")
    .eq("type", "rental")
    .in("status", ACTIVE_STATUSES);
  if (error) throw error;

  const today = istToday();
  const currentlyOut = new Set<string>();
  const upcomingBooked = new Set<string>();
  for (const row of data ?? []) {
    if (row.pickup_date <= today) currentlyOut.add(row.item_id);
    else upcomingBooked.add(row.item_id);
  }
  return { currentlyOut, upcomingBooked };
}
