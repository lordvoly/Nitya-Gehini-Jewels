import { useState } from "react";
import { BookingDetail } from "../components/bookings/BookingDetail";
import { BookingForm } from "../components/bookings/BookingForm";
import { BookingsList } from "../components/bookings/BookingsList";
import { ReturnForm } from "../components/bookings/ReturnForm";
import type { BookingWithDetails } from "../lib/bookings";
import "../styles/shared.css";

export default function BookingsPage() {
  const [view, setView] = useState<"add" | "list">("add");
  const [returningBooking, setReturningBooking] = useState<BookingWithDetails | null>(null);
  const [viewingBookingId, setViewingBookingId] = useState<string | null>(null);

  function resetToTab(next: "add" | "list") {
    setReturningBooking(null);
    setViewingBookingId(null);
    setView(next);
  }

  return (
    <div className="page">
      <div className="page-tabs">
        <button
          className={view === "add" && !returningBooking && !viewingBookingId ? "tab active" : "tab"}
          onClick={() => resetToTab("add")}
        >
          + New Booking
        </button>
        <button
          className={view === "list" || returningBooking || viewingBookingId ? "tab active" : "tab"}
          onClick={() => resetToTab("list")}
        >
          All Bookings
        </button>
      </div>

      {viewingBookingId ? (
        <BookingDetail bookingId={viewingBookingId} onBack={() => setViewingBookingId(null)} />
      ) : returningBooking ? (
        <ReturnForm
          booking={returningBooking}
          onCancel={() => {
            setReturningBooking(null);
            setView("list");
          }}
        />
      ) : view === "add" ? (
        <BookingForm />
      ) : (
        <BookingsList onProcessReturn={setReturningBooking} onViewDetail={setViewingBookingId} />
      )}
    </div>
  );
}
