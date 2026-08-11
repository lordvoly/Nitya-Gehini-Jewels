import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BookingDetail } from "../components/bookings/BookingDetail";
import { BookingForm } from "../components/bookings/BookingForm";
import { BookingsList } from "../components/bookings/BookingsList";
import { ReturnForm } from "../components/bookings/ReturnForm";
import type { LegacyFlatBookingWithDetails } from "../lib/bookings";
import "../styles/shared.css";

export default function BookingsPage() {
  const [searchParams] = useSearchParams();
  const [view, setView] = useState<"add" | "list">("add");
  const [returningBooking, setReturningBooking] = useState<LegacyFlatBookingWithDetails | null>(null);
  const [viewingBookingId, setViewingBookingId] = useState<string | null>(null);

  // Deep link from elsewhere (e.g. the Dashboard) straight into a specific
  // booking's detail view: /bookings?booking=<id>.
  useEffect(() => {
    const id = searchParams.get("booking");
    if (id) setViewingBookingId(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
