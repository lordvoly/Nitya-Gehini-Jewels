import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, Pencil } from "lucide-react";
import {
  fetchBookings,
  type Booking,
  type BookingItem,
  type BookingCategory,
  type BookingDateBasis,
  type BookingTimeRange,
  type BookingTypeFilter,
} from "../../lib/bookings";
import { bookingItemStatusPill, bookingComputedStatusPill } from "../../lib/statusPill";
import { formatDateDisplay } from "../../lib/dates";
import { FilterDropdown } from "../common/FilterDropdown";
import { BookingCardsSkeleton } from "../common/Skeleton";
import { useSlowLoadHint } from "../../lib/useSlowLoadHint";

const DATE_BASIS_LABELS: Record<BookingDateBasis, string> = {
  pickup: "Pickup Date",
  booking: "Booking Date",
};

const CATEGORY_LABELS: Record<BookingCategory, string> = {
  all: "All",
  out: "Currently Out",
  needs_confirmation: "Needs Confirmation",
  booked: "Booked",
  completed: "Completed",
  cancelled: "Cancelled",
};

const CATEGORY_EMPTY_COPY: Record<BookingCategory, { title: string; hint: string }> = {
  all: { title: "No bookings yet", hint: "Create your first rental or sale to see it here." },
  out: { title: "Nothing currently out", hint: "Bookings with a confirmed pickup will show up here." },
  needs_confirmation: {
    title: "Nothing needs confirmation",
    hint: "Bookings with an item past its pickup date but never confirmed will show up here.",
  },
  booked: { title: "Nothing booked ahead", hint: "Bookings with an item not yet due for pickup will show up here." },
  completed: { title: "No completed bookings", hint: "Bookings with a returned or sold item will show up here." },
  cancelled: { title: "No cancelled bookings", hint: "Cancelled bookings will show up here." },
};

const TIME_RANGE_LABELS: Record<BookingTimeRange, string> = {
  all: "All Time",
  week: "Past Week",
  month: "Past Month",
  "3months": "Past 3 Months",
  year: "Past Year",
};

const TYPE_FILTER_LABELS: Record<BookingTypeFilter, string> = {
  all: "All",
  rental: "Rental",
  sale: "Sale",
};

// One card per family transaction — a flat table row can't express "one
// booking, several items on independent schedules," which is the whole
// point of this schema (§8). Items and Customers keep the shared
// .data-table pattern; this is the one list that doesn't.
export function BookingsList({
  onProcessReturn,
  onConfirmPickup,
  onViewDetail,
  onEditBooking,
  filterItemId = null,
  onClearItemFilter,
  filterCustomerId = null,
  readOnly = false,
}: {
  onProcessReturn?: (booking: Booking, item: BookingItem) => void;
  onConfirmPickup?: (booking: Booking, item: BookingItem) => void;
  onViewDetail: (bookingId: string) => void;
  onEditBooking?: (bookingId: string) => void;
  // Deep link from the Items list's "Out"/"Booked" badges: show only this
  // item's currently active bookings (the ones actually behind that badge),
  // not its full history. See BookingsPage's ?item=<id> handling.
  filterItemId?: string | null;
  onClearItemFilter?: () => void;
  // Embedded on a customer's own detail page (CustomerDetail.tsx): show
  // only this customer's bookings — full history, unlike filterItemId,
  // since this is a record of everything rather than a live "what's
  // behind this badge" narrowing.
  filterCustomerId?: string | null;
  // The customer page embeds this as "view history, click through" — no
  // Process Return / Edit Booking actions inline (that's booking-detail
  // territory), only View, so booking management isn't duplicated here.
  readOnly?: boolean;
}) {
  const [term, setTerm] = useState("");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  // Category (item-status bucket) and date basis/time range are both new,
  // server-side-filtered controls — only shown on the main "All Bookings"
  // tab (not filterItemId/filterCustomerId's narrowed views, same scoping
  // as the search box just below). Defaults ("all"/"pickup"/"all") are
  // deliberately omitted from the request entirely (see params below)
  // rather than sent as explicit query params, so a filter-untouched page
  // load is byte-for-byte the same request as before this feature existed.
  const [category, setCategory] = useState<BookingCategory>("all");
  const [dateBasis, setDateBasis] = useState<BookingDateBasis>("pickup");
  const [timeRange, setTimeRange] = useState<BookingTimeRange>("all");
  const [typeFilter, setTypeFilter] = useState<BookingTypeFilter>("all");

  // Same debounced, cancelled-flag-guarded search as CustomersList: a
  // 300ms pause before the request fires, and a newer search's response
  // can't be clobbered by an older one landing late. When filterItemId or
  // filterCustomerId is set, search/category/date filters are bypassed
  // entirely — the filter takes over.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(
      () => {
        let params: Record<string, string> | undefined;
        if (filterItemId) {
          params = { item_id: filterItemId };
        } else if (filterCustomerId) {
          params = { customer_id: filterCustomerId };
        } else {
          const extra: Record<string, string> = {};
          if (term) extra.search = term;
          if (category !== "all") extra.category = category;
          if (typeFilter !== "all") extra.type = typeFilter;
          if (timeRange !== "all") {
            extra.time_range = timeRange;
            extra.date_basis = dateBasis;
          }
          params = Object.keys(extra).length > 0 ? extra : undefined;
        }
        fetchBookings(params)
          .then((data) => {
            if (cancelled) return;
            // The backend filter returns every booking that has ever
            // included this item, any status — narrow to the ones actually
            // still active for this item, matching what the badge meant.
            // filterCustomerId gets no such narrowing — a customer's page
            // is meant to show their full history, not just what's active.
            const filtered = filterItemId
              ? data.filter((b) =>
                  b.booking_items.some(
                    (bi) => bi.item_id === filterItemId && (bi.status === "booked" || bi.status === "out"),
                  ),
                )
              : data;
            setBookings(filtered);
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
      },
      filterItemId || filterCustomerId ? 0 : 300,
    );
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [term, filterItemId, filterCustomerId, category, typeFilter, dateBasis, timeRange]);

  // Only a genuinely empty first load (nothing ever fetched yet) gets the
  // heavier skeleton treatment — a subsequent search/filter change over
  // data already on screen keeps the existing lightweight "Searching…"/
  // "Loading…" text instead, since that's a fast, already-warm-backend case.
  const showSkeleton = loading && bookings.length === 0;
  const showSlowHint = useSlowLoadHint(showSkeleton);

  return (
    <div>
      {filterItemId ? (
        <div className="found-panel">
          <p>
            Showing this item's current bookings only.{" "}
            <button type="button" className="btn-secondary" onClick={onClearItemFilter}>
              Show All Bookings
            </button>
          </p>
        </div>
      ) : filterCustomerId ? null : (
        <>
          <input
            className="search-input"
            type="text"
            placeholder="Search by booking code or customer…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />

          <div className="filter-dropdown-bar">
            <FilterDropdown
              label="Show"
              value={category}
              options={Object.keys(CATEGORY_LABELS) as BookingCategory[]}
              optionLabels={CATEGORY_LABELS}
              onChange={setCategory}
            />
            <FilterDropdown
              label="Type"
              value={typeFilter}
              options={Object.keys(TYPE_FILTER_LABELS) as BookingTypeFilter[]}
              optionLabels={TYPE_FILTER_LABELS}
              onChange={setTypeFilter}
            />
            <FilterDropdown
              label="Sort"
              value={dateBasis}
              options={Object.keys(DATE_BASIS_LABELS) as BookingDateBasis[]}
              optionLabels={DATE_BASIS_LABELS}
              onChange={setDateBasis}
            />
            <FilterDropdown
              label="Time"
              value={timeRange}
              options={Object.keys(TIME_RANGE_LABELS) as BookingTimeRange[]}
              optionLabels={TIME_RANGE_LABELS}
              onChange={setTimeRange}
            />
          </div>
        </>
      )}
      <div className="list-header">
        <h2>
          {filterItemId
            ? `Current Bookings (${bookings.length})`
            : filterCustomerId
              ? `Bookings (${bookings.length})`
              : term
                ? `Results (${bookings.length})`
                : category !== "all"
                  ? `${CATEGORY_LABELS[category]} (${bookings.length})`
                  : `All Bookings (${bookings.length})`}
        </h2>
        {loading && !showSkeleton && (
          <span className="wizard-hint">{filterItemId || filterCustomerId ? "Loading…" : "Searching…"}</span>
        )}
      </div>

      {showSkeleton && (
        <>
          <BookingCardsSkeleton />
          {showSlowHint && (
            <p className="wizard-hint slow-load-hint">
              Still loading. The server may be waking up after a period of inactivity, which can take up to a
              minute.
            </p>
          )}
        </>
      )}

      {!showSkeleton && bookings.length === 0 && !loading && (
        <div className="empty-state">
          {filterItemId ? (
            <>
              <h3>Nothing currently booked</h3>
              <p>This item has no active bookings right now.</p>
            </>
          ) : filterCustomerId ? (
            <>
              <h3>No bookings yet</h3>
              <p>This customer hasn't booked anything yet.</p>
            </>
          ) : term ? (
            <>
              <h3>No bookings match</h3>
              <p>Nothing found for "{term}" — check the spelling or try just the booking code.</p>
            </>
          ) : (
            <>
              <h3>{CATEGORY_EMPTY_COPY[category].title}</h3>
              <p>{CATEGORY_EMPTY_COPY[category].hint}</p>
            </>
          )}
        </div>
      )}

      {bookings.map((b) => {
        const statusPill = bookingComputedStatusPill(b.computed_status, b.resolved_item_count, b.active_item_count);
        return (
          <div className="booking-card" key={b.id}>
            <div className="booking-card-header">
              <div>
                <p className="booking-card-title">{b.booking_code}</p>
                <p className="booking-card-customer">
                  {b.customers?.name ? (
                    // No link on a customer's own page for their own name —
                    // it'd just point back at the page already showing.
                    b.customer_id === filterCustomerId ? (
                      b.customers.name
                    ) : (
                      <Link to={`/customers?customer=${b.customer_id}`}>{b.customers.name}</Link>
                    )
                  ) : (
                    "—"
                  )}
                </p>
                <p className="booking-card-date wizard-hint">Booked on: {formatDateDisplay(b.booking_date)}</p>
              </div>
              <div className="booking-card-status">
                <span className={`pill ${statusPill.className}`}>{statusPill.label}</span>
                {statusPill.fraction && <span className="status-fraction">{statusPill.fraction}</span>}
              </div>
            </div>

            <div className="booking-card-financials">
              <span>
                Paid: <strong>₹{b.total_paid}</strong>
              </span>
              <span>
                Balance: <strong>₹{b.balance_due}</strong>
              </span>
            </div>

            <div className="booking-card-items">
              {b.booking_items.map((bi) => {
                const itemPill = bookingItemStatusPill(bi);
                const canReturn = bi.type === "rental" && (bi.status === "booked" || bi.status === "out");
                const canConfirmPickup = bi.status === "booked";
                return (
                  <div className="booking-card-item" key={bi.id}>
                    <div className="booking-card-item-info">
                      <strong>
                        {bi.items?.item_code} — {bi.items?.name}
                      </strong>
                      <span>
                        {bi.type === "rental" ? "Rental" : "Sale"} · {formatDateDisplay(bi.pickup_date)}
                        {bi.return_date ? ` → ${formatDateDisplay(bi.return_date)}` : ""}
                      </span>
                      {bi.items?.tracking_type === "unique" &&
                        (bi.future_booking_items && bi.future_booking_items.length > 0 ? (
                          <button
                            type="button"
                            className="booking-card-item-next booking-card-item-next-link"
                            onClick={() => onViewDetail(bi.future_booking_items![0].booking_id!)}
                          >
                            Next: {bi.future_booking_items[0].booking_code} —{" "}
                            {bi.future_booking_items[0].customer_name ?? "—"}, {formatDateDisplay(bi.future_booking_items[0].pickup_date)}
                          </button>
                        ) : (
                          <span className="booking-card-item-next">No bookings ahead</span>
                        ))}
                    </div>
                    <div className="booking-card-item-actions">
                      <span className={`pill ${itemPill.className}`}>{itemPill.label}</span>
                      {!readOnly && canConfirmPickup && onConfirmPickup && (
                        <button className="btn-secondary" onClick={() => onConfirmPickup(b, bi)}>
                          Confirm Pickup
                        </button>
                      )}
                      {!readOnly && canReturn && onProcessReturn && (
                        <button className="btn-secondary" onClick={() => onProcessReturn(b, bi)}>
                          Process Return
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="booking-card-actions">
              <button className="btn-icon" aria-label="View" onClick={() => onViewDetail(b.id)}>
                <Eye size={17} strokeWidth={2} aria-hidden="true" />
              </button>
              {!readOnly && onEditBooking && (
                <button className="btn-icon" aria-label="Edit" onClick={() => onEditBooking(b.id)}>
                  <Pencil size={16} strokeWidth={2} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
