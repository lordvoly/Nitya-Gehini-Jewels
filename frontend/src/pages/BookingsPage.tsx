import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BookingDetail } from "../components/bookings/BookingDetail";
import { BookingForm } from "../components/bookings/BookingForm";
import { BookingsList } from "../components/bookings/BookingsList";
import { ReturnForm } from "../components/bookings/ReturnForm";
import { EditBookingForm } from "../components/bookings/EditBookingForm";
import type { Booking, BookingItem } from "../lib/bookings";
import "../styles/shared.css";

export default function BookingsPage() {
  const [searchParams] = useSearchParams();
  const [view, setView] = useState<"add" | "list">("list");
  const [returningItem, setReturningItem] = useState<{ booking: Booking; item: BookingItem } | null>(null);
  const [viewingBookingId, setViewingBookingId] = useState<string | null>(null);
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);

  // Deep link from elsewhere (e.g. the Dashboard) straight into a specific
  // booking's detail view: /bookings?booking=<id>.
  useEffect(() => {
    const id = searchParams.get("booking");
    if (id) setViewingBookingId(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetToTab(next: "add" | "list") {
    setReturningItem(null);
    setViewingBookingId(null);
    setEditingBookingId(null);
    setView(next);
  }

  const onTab = view === "add" && !returningItem && !viewingBookingId && !editingBookingId;

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
      ) : viewingBookingId ? (
        <BookingDetail
          bookingId={viewingBookingId}
          onBack={() => setViewingBookingId(null)}
          onEdit={() => setEditingBookingId(viewingBookingId)}
          onProcessReturn={(booking, item) => setReturningItem({ booking, item })}
        />
      ) : view === "add" ? (
        <BookingForm />
      ) : (
        <BookingsList
          onProcessReturn={(booking, item) => setReturningItem({ booking, item })}
          onViewDetail={setViewingBookingId}
          onEditBooking={setEditingBookingId}
        />
      )}
    </div>
  );
}
