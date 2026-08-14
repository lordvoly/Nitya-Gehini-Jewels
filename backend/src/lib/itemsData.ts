import { supabase } from "./supabase.js";
import { ACTIVE_STATUSES } from "../routes/bookings.js";
import { istToday } from "./dates.js";

// "Currently out" is never a stored column — a unique item's own `status`
// is deliberately never flipped to 'rented_out' on rental creation (see the
// long comment above POST /api/bookings in routes/bookings.ts), so it has
// to be computed live from booking_items, same as everything else this app
// treats as a live/computed value rather than a written-to field.
//
// A booking_item's own status only ever moves 'booked' -> 'returned' (or
// 'cancelled') in this app — nothing anywhere sets it to 'out'. That status
// value exists in the schema but no code path ever transitions to it (no
// "confirm pickup" step exists). So `status in ACTIVE_STATUSES` alone
// matches every still-open rental regardless of whether pickup day has
// actually arrived — a booking reserved for three months from now was
// showing as "currently out" today. The pickup_date <= today check below is
// what actually distinguishes "reserved for later" from "out right now".
export async function getCurrentlyOutItemIds(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("booking_items")
    .select("item_id")
    .eq("type", "rental")
    .in("status", ACTIVE_STATUSES)
    .lte("pickup_date", istToday());
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.item_id));
}
