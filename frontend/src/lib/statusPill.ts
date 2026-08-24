import type { ItemStatus } from "./items";
import type { BookingComputedStatus, BookingItemStatus, BookingItemType } from "./bookings";

export interface PillInfo {
  className: string;
  label: string;
}

// One small vocabulary reused across item/booking-item/computed status:
// good (done or available), active (in progress), attention (needs a look),
// neutral (inactive/terminal) — see shared.css's pill rules for why.
export function itemStatusPill(status: ItemStatus): PillInfo {
  switch (status) {
    case "available":
      return { className: "pill-good", label: "Active" };
    case "rented_out":
      return { className: "pill-active", label: "Rented Out" };
    case "sold":
      return { className: "pill-neutral", label: "Sold" };
    case "in_maintenance":
      return { className: "pill-attention", label: "In Maintenance" };
  }
}

// A single booking_items row's own status (booked/out/returned/cancelled) —
// takes the whole item (not just status) because "booked" now splits three
// ways depending on type and whether pickup is overdue-but-unconfirmed.
// pickup_overdue is computed server-side (bookings.ts's attachChains()) —
// never derived here from a client-side "today", per this app's IST rule.
// Confirmed 'out' is deliberately never "attention" styling — that's
// reserved for the one state that genuinely needs a look (not yet
// confirmed, past due); a confirmed pickup is a settled, non-urgent state,
// same reasoning as itemStatusPill's own good/neutral/attention split.
export function bookingItemStatusPill(bi: {
  status: BookingItemStatus;
  type: BookingItemType;
  pickup_overdue?: boolean;
}): PillInfo {
  switch (bi.status) {
    case "returned":
      // Deliberately not pill-good — a booking's own computed_status can
      // read "Completed" (pill-good) right next to one of its items
      // reading "Returned" on the same screen, and those are two
      // different-grain achievements that shouldn't look identical.
      return { className: "pill-info", label: "Returned" };
    case "cancelled":
      return { className: "pill-neutral", label: "Cancelled" };
    case "out":
      return bi.type === "sale" ? { className: "pill-neutral", label: "Picked Up" } : { className: "pill-neutral", label: "Out" };
    case "booked":
      if (bi.type === "sale") return { className: "pill-active", label: "Awaiting Pickup" };
      if (bi.pickup_overdue) return { className: "pill-attention", label: "Pickup Overdue — Not Confirmed" };
      return { className: "pill-active", label: "Booked" };
  }
}

// The parent family booking's computed rollup (§8 decision B) — Active
// bookings additionally get the "X of Y items returned" fraction text,
// built here from booking_status's raw counts rather than in the view
// (compute the numbers, format at the edge — same rule as every other
// computed value in this app).
export function bookingComputedStatusPill(
  status: BookingComputedStatus,
  resolvedItemCount: number,
  activeItemCount: number,
): PillInfo & { fraction: string | null } {
  switch (status) {
    case "active":
      return {
        className: "pill-active",
        label: "Active",
        fraction: `${resolvedItemCount} of ${activeItemCount} items returned`,
      };
    case "completed":
      return { className: "pill-good", label: "Completed", fraction: null };
    case "cancelled":
      return { className: "pill-neutral", label: "Cancelled", fraction: null };
  }
}
