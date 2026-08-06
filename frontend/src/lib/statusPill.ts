import type { ItemStatus } from "./items";
import type { BookingStatus } from "./bookings";

export interface PillInfo {
  className: string;
  label: string;
}

// One small vocabulary reused for both item and booking status: good (done
// or available), active (in progress), attention (needs a look), neutral
// (inactive/terminal) — see shared.css's pill rules for why.
export function itemStatusPill(status: ItemStatus): PillInfo {
  switch (status) {
    case "available":
      return { className: "pill-good", label: "Available" };
    case "rented_out":
      return { className: "pill-active", label: "Rented Out" };
    case "sold":
      return { className: "pill-neutral", label: "Sold" };
    case "in_maintenance":
      return { className: "pill-attention", label: "In Maintenance" };
  }
}

export function bookingStatusPill(status: BookingStatus): PillInfo {
  switch (status) {
    case "booked":
      return { className: "pill-active", label: "Booked" };
    case "out":
      return { className: "pill-active", label: "Out" };
    case "returned":
      return { className: "pill-good", label: "Returned" };
    case "completed":
      return { className: "pill-good", label: "Completed" };
    case "cancelled":
      return { className: "pill-neutral", label: "Cancelled" };
  }
}
