import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BookingDetail } from "../components/bookings/BookingDetail";
import { BookingForm } from "../components/bookings/BookingForm";
import { BookingsList } from "../components/bookings/BookingsList";
import { ReturnForm } from "../components/bookings/ReturnForm";
import { ConfirmPickupForm } from "../components/bookings/ConfirmPickupForm";
import { EditBookingForm } from "../components/bookings/EditBookingForm";
import type { Booking, BookingItem } from "../lib/bookings";
import "../styles/shared.css";

export default function BookingsPage() {
  const [searchParams] = useSearchParams();
  const [view, setView] = useState<"add" | "list">("list");
  const [returningItem, setReturningItem] = useState<{ booking: Booking; item: BookingItem } | null>(null);
  const [confirmingPickup, setConfirmingPickup] = useState<{ booking: Booking; item: BookingItem } | null>(null);
  const [viewingBookingId, setViewingBookingId] = useState<string | null>(null);
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [filterItemId, setFilterItemId] = useState<string | null>(null);

  // Deep link from elsewhere (e.g. the Dashboard) straight into a specific
  // booking's detail view: /bookings?booking=<id>. Or from the Items list's
  // "Out"/"Booked" badges, into that item's current bookings:
  // /bookings?item=<id>. Read once on mount, same as everywhere else this
  // pattern is used.
  useEffect(() => {
    const bookingId = searchParams.get("booking");
    if (bookingId) setViewingBookingId(bookingId);
    const itemId = searchParams.get("item");
    if (itemId) setFilterItemId(itemId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetToTab(next: "add" | "list") {
    setReturningItem(null);
    setConfirmingPickup(null);
    setViewingBookingId(null);
    setEditingBookingId(null);
    setFilterItemId(null);
    setView(next);
  }

  const onTab = view === "add" && !returningItem && !confirmingPickup && !viewingBookingId && !editingBookingId;

  return (
    <div className="page">
      <div className="page-tabs">
        <button className={onTab ? "tab active" : "tab"} onClick={() => resetToTab("add")}>
          + New Booking
        </button>
        <button className={!onTab ? "tab active" : "tab"} onClick={() => resetToTab("list")}>
          All Bookings
        </button>
      </div>

      {editingBookingId ? (
        <EditBookingForm
          bookingId={editingBookingId}
          onCancel={() => {
            setEditingBookingId(null);
            setView("list");
          }}
          onDone={() => {
            const id = editingBookingId;
            setEditingBookingId(null);
            setViewingBookingId(id);
          }}
        />
      ) : returningItem ? (
        <ReturnForm
          booking={returningItem.booking}
          item={returningItem.item}
          onCancel={() => {
            setReturningItem(null);
            setView("list");
          }}
        />
      ) : confirmingPickup ? (
        <ConfirmPickupForm
          booking={confirmingPickup.booking}
          item={confirmingPickup.item}
          onCancel={() => {
            setConfirmingPickup(null);
            setView("list");
          }}
        />
      ) : viewingBookingId ? (
        <BookingDetail
          bookingId={viewingBookingId}
          onBack={() => setViewingBookingId(null)}
          onEdit={() => setEditingBookingId(viewingBookingId)}
          onProcessReturn={(booking, item) => setReturningItem({ booking, item })}
          onConfirmPickup={(booking, item) => setConfirmingPickup({ booking, item })}
        />
      ) : view === "add" ? (
        <BookingForm />
      ) : (
        <BookingsList
          onProcessReturn={(booking, item) => setReturningItem({ booking, item })}
          onConfirmPickup={(booking, item) => setConfirmingPickup({ booking, item })}
          onViewDetail={setViewingBookingId}
          onEditBooking={setEditingBookingId}
          filterItemId={filterItemId}
          onClearItemFilter={() => setFilterItemId(null)}
        />
      )}
    </div>
  );
}
