import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BookingDetail } from "../components/bookings/BookingDetail";
import { BookingForm } from "../components/bookings/BookingForm";
import { BookingsList } from "../components/bookings/BookingsList";
import { ReturnForm } from "../components/bookings/ReturnForm";
import { EditBookingForm } from "../components/bookings/EditBookingForm";
import type { Booking, BookingItem } from "../lib/bookings";

export default function BookingsPage() {
  const [searchParams] = useSearchParams();
  const [view, setView] = useState<"add" | "list">("list");
  const [returningItem, setReturningItem] = useState<{ booking: Booking; item: BookingItem } | null>(null);
  const [viewingBookingId, setViewingBookingId] = useState<string | null>(null);
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);

  useEffect(() => {
    const id = searchParams.get("booking");
    if (id) {
      setViewingBookingId(id);
      setView("list");
    }
  }, [searchParams]);

  function resetToTab(next: "add" | "list") {
    setReturningItem(null);
    setViewingBookingId(null);
    setEditingBookingId(null);
    setView(next);
  }

  const isNewBookingTab = view === "add" && !returningItem && !viewingBookingId && !editingBookingId;

  return (
    <div className="container-fluid p-0">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <h1 className="h3 mb-1 fw-semibold text-dark">Rentals & Bookings</h1>
          <p className="text-muted mb-0 small">Create new rental reservations, process returns, and view booking history</p>
        </div>
        <div className="d-flex gap-2">
          {isNewBookingTab ? (
            <button className="btn btn-outline-secondary d-inline-flex align-items-center gap-1" onClick={() => resetToTab("list")}>
              <i className="ti ti-arrow-left"></i> View All Bookings
            </button>
          ) : (
            <button className="btn btn-primary d-inline-flex align-items-center gap-1" onClick={() => resetToTab("add")}>
              <i className="ti ti-plus"></i> New Booking
            </button>
          )}
        </div>
      </div>

      {/* Nav Pills */}
      <ul className="nav nav-pills mb-4 bg-white p-2 rounded-3 border shadow-sm" style={{ maxWidth: 350 }}>
        <li className="nav-item flex-fill text-center">
          <button
            className={`nav-link w-100 fw-medium ${!isNewBookingTab ? "active" : ""}`}
            onClick={() => resetToTab("list")}
          >
            <i className="ti ti-calendar-event me-1"></i> All Bookings
          </button>
        </li>
        <li className="nav-item flex-fill text-center">
          <button
            className={`nav-link w-100 fw-medium ${isNewBookingTab ? "active" : ""}`}
            onClick={() => resetToTab("add")}
          >
            <i className="ti ti-plus me-1"></i> New Booking
          </button>
        </li>
      </ul>

      {/* Main Content Area */}
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
