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

export interface ResolvedItem {
  id: string;
  item_code: string;
  name: string;
  tracking_type: "unique" | "quantity";
  status: string;
  quantity_on_hand: number | null;
}

export type ItemResolution = { item: ResolvedItem } | { error: string; candidates?: { item_code: string; name: string }[] };

// Shared item-code-or-name resolver for the AI assistant's item-scoped
// tools (get_item_availability, get_item_revenue) — exact item_code match
// first (item_code is unique, so a hit here is never ambiguous), falling
// back to a name substring search only when no code matches. A name search
// that hits more than one real item is reported back as a genuine
// ambiguity for the caller to ask about, never silently resolved to the
// first result — matching this app's "don't guess" rule for anything
// money- or inventory-affecting.
export async function resolveItemByCodeOrName(term: string): Promise<ItemResolution> {
  const trimmed = term.trim();
  if (!trimmed) return { error: "No item code or name given" };

  const { data: byCode, error: codeError } = await supabase.from("items").select("*").ilike("item_code", trimmed);
  if (codeError) throw codeError;
  if (byCode && byCode.length === 1) return { item: byCode[0] };

  const { data: byName, error: nameError } = await supabase.from("items").select("*").ilike("name", `%${trimmed}%`);
  if (nameError) throw nameError;
  if (!byName || byName.length === 0) {
    return { error: `No item found matching "${trimmed}" — check the item code or name and try again.` };
  }
  if (byName.length > 1) {
    return {
      error: `"${trimmed}" matches more than one item — ask which one is meant.`,
      candidates: byName.map((i) => ({ item_code: i.item_code, name: i.name })),
    };
  }
  return { item: byName[0] };
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
