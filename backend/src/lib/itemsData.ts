import { supabase } from "./supabase.js";
import { ACTIVE_STATUSES } from "../routes/bookings.js";

// "Currently out" is never a stored column — a unique item's own `status`
// is deliberately never flipped to 'rented_out' on rental creation (see the
// long comment above POST /api/bookings in routes/bookings.ts), so it has
// to be computed live from booking_items, same as everything else this app
// treats as a live/computed value rather than a written-to field. This is
// the exact query dashboard.ts's items_out stat already used — factored out
// here so the Items list filter reads the same live truth instead of a
// second, potentially-drifting implementation of "is this out right now".
export async function getCurrentlyOutItemIds(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("booking_items")
    .select("item_id")
    .eq("type", "rental")
    .in("status", ACTIVE_STATUSES);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.item_id));
}
