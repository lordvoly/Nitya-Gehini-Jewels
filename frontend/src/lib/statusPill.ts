import type { ItemStatus } from "./items";
import type { BookingComputedStatus, BookingItemStatus } from "./bookings";

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

// A single booking_items row's own status (booked/out/returned/cancelled).
export function bookingItemStatusPill(status: BookingItemStatus): PillInfo {
  switch (status) {
    case "booked":
      return { className: "pill-active", label: "Booked" };
    case "out":
      return { className: "pill-active", label: "Out" };
    case "returned":
      return { className: "pill-good", label: "Returned" };
    case "cancelled":
      return { className: "pill-neutral", label: "Cancelled" };
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
