import { supabase } from "./supabase.js";

// A checklist entry left unchecked at return time, with no item_charges row
// ever raised against it — the earlier, purely physical-custody stage that
// never became a financial matter at all. Distinct from routes/itemCharges.ts's
// getItemCharges(false) (a real charge already raised, awaiting payment) —
// once something IS charged for, it's tracked there instead, not here.
export function computePendingComponentNames(
  checklist: Record<string, boolean> | null | undefined,
  chargedNames: Set<string>,
): string[] {
  if (!checklist) return [];
  return Object.entries(checklist)
    .filter(([name, checked]) => !checked && !chargedNames.has(name.trim().toLowerCase()))
    .map(([name]) => name);
}

export interface BookingItemCharge {
  id: string;
  description: string;
  charge_amount: number;
  resolved: boolean;
  charged_at: string;
  resolved_at: string | null;
}

// Batched: booking_item id -> every item_charges row raised against it,
// regardless of resolution status — the one shared query behind both
// computePendingComponentNames' "already charged, exclude" set (derived
// from this, see chargedNamesFrom below) AND the permanent "this booking
// once had a lost/damaged item charge" marker (bookings.ts's
// attachPendingComponents), which deliberately does NOT disappear once a
// charge is resolved — unlike the pending-checklist concept above, a
// charge's own history is worth keeping visible even after it's settled.
export async function getChargesByBookingItem(bookingItemIds: string[]): Promise<Map<string, BookingItemCharge[]>> {
  if (bookingItemIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("item_charges")
    .select("id, booking_item_id, description, charge_amount, resolved, charged_at, resolved_at")
    .in("booking_item_id", bookingItemIds);
  if (error) throw error;
  const map = new Map<string, BookingItemCharge[]>();
  for (const row of data ?? []) {
    const list = map.get(row.booking_item_id) ?? [];
    list.push({
      id: row.id,
      description: row.description,
      charge_amount: row.charge_amount,
      resolved: row.resolved,
      charged_at: row.charged_at,
      resolved_at: row.resolved_at,
    });
    map.set(row.booking_item_id, list);
  }
  return map;
}

// Matching a checklist entry to a charge is necessarily best-effort string
// comparison — item_charges.description defaults to the component name at
// charge time (see bookings.ts's return endpoint) but is operator-editable,
// so a charge whose description was rewritten to something unrelated won't
// be matched here and its checklist entry would still (correctly, if
// rarely confusingly) show as pending. Not worth a stricter link for how
// rarely that field is actually edited away from its default.
export function chargedNamesFrom(charges: BookingItemCharge[]): Set<string> {
  return new Set(charges.map((c) => c.description.trim().toLowerCase()));
}

export interface PendingItemEntry {
  booking_id: string;
  booking_code: string;
  customer_id: string;
  customer_name: string;
  booking_item_id: string;
  item_id: string;
  item_code: string;
  item_name: string;
  component_name: string;
  actual_return_date: string | null;
  return_notes: string | null;
}

// The universal "flagged as still missing at return time, never formally
// charged for" view — every checklist entry across every booking left
// unchecked with no matching charge. Shared by GET /api/pending-items
// (routes/pendingItems.ts), the Dashboard summary, and the AI assistant's
// get_pending_items tool — one query, not three reimplementations.
export async function getPendingItems(): Promise<PendingItemEntry[]> {
  const { data: bookingItems, error } = await supabase
    .from("booking_items")
    .select(
      "id, booking_id, item_id, return_checklist, return_notes, actual_return_date, bookings(booking_code, customer_id, customers(name)), items(item_code, name)",
    )
    .eq("status", "returned")
    .not("return_checklist", "is", null);
  if (error) throw error;

  const rows = bookingItems ?? [];
  const chargesByBookingItem = await getChargesByBookingItem(rows.map((bi) => bi.id));

  const result: PendingItemEntry[] = [];
  for (const bi of rows) {
    const pendingNames = computePendingComponentNames(
      bi.return_checklist as Record<string, boolean> | null,
      chargedNamesFrom(chargesByBookingItem.get(bi.id) ?? []),
    );
    if (pendingNames.length === 0) continue;
    const booking = bi.bookings as unknown as { booking_code: string; customer_id: string; customers: { name: string } | null } | null;
    const item = bi.items as unknown as { item_code: string; name: string } | null;
    for (const name of pendingNames) {
      result.push({
        booking_id: bi.booking_id,
        booking_code: booking?.booking_code ?? "—",
        customer_id: booking?.customer_id ?? "",
        customer_name: booking?.customers?.name ?? "—",
        booking_item_id: bi.id,
        item_id: bi.item_id,
        item_code: item?.item_code ?? "—",
        item_name: item?.name ?? "—",
        component_name: name,
        actual_return_date: bi.actual_return_date,
        return_notes: bi.return_notes,
      });
    }
  }
  // Most-recently-returned first, same "what to look at first" convention
  // getItemCharges' own charged_at-descending order already uses.
  return result.sort((a, b) => (b.actual_return_date ?? "").localeCompare(a.actual_return_date ?? ""));
}
