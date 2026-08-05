import { useState } from "react";
import { BookingForm } from "../components/bookings/BookingForm";
import { BookingsList } from "../components/bookings/BookingsList";
import { ReturnForm } from "../components/bookings/ReturnForm";
import type { BookingWithDetails } from "../lib/bookings";
import "../styles/shared.css";

export default function BookingsPage() {
  const [view, setView] = useState<"add" | "list">("add");
  const [returningBooking, setReturningBooking] = useState<BookingWithDetails | null>(null);

  return (
    <div className="page">
      <div className="page-tabs">
        <button
          className={view === "add" && !returningBooking ? "tab active" : "tab"}
          onClick={() => {
            setReturningBooking(null);
            setView("add");
          }}
        >
          + New Booking
        </button>
        <button
          className={view === "list" || returningBooking ? "tab active" : "tab"}
          onClick={() => {
            setReturningBooking(null);
            setView("list");
          }}
        >
          All Bookings
        </button>
      </div>

      {returningBooking ? (
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
        <BookingsList onProcessReturn={setReturningBooking} />
      )}
    </div>
  );
}
