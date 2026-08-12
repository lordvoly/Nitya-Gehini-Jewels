import { useEffect, useState } from "react";
import { Modal } from "../common/Modal";
import type { DashboardSummary } from "../../lib/dashboard";

type AlertKind = "payment" | "items";

// Scoped per browser + user (not per device/session) via localStorage,
// keyed off the server's own IST "today" (summary.today) rather than
// anything computed from new Date() here — see CLAUDE.md's rule against
// frontend-computed business dates. This is a UI nicety (don't nag on a
// page opened dozens of times a day), not business logic, but the day
// boundary should still agree with the shop's actual day.
function dismissedKey(kind: AlertKind, userId: string) {
  return `ngj_dashboard_alert_dismissed:${kind}:${userId}`;
}

function wasDismissedToday(kind: AlertKind, userId: string, today: string): boolean {
  try {
    return localStorage.getItem(dismissedKey(kind, userId)) === today;
  } catch {
    return false;
  }
}

function markDismissed(kind: AlertKind, userId: string, today: string) {
  try {
    localStorage.setItem(dismissedKey(kind, userId), today);
  } catch {
    // Private browsing / storage disabled — worst case the popup just
    // shows again next load, a harmless degrade rather than a crash.
  }
}

// Two dismissible on-load popups summarizing data the Dashboard page below
// already renders in full — "Payment Due" (outstanding balance across
// active bookings) and "Item Due" (today's returns + overdue rentals,
// flagging next-customer-waiting urgency the same way the Overdue Rentals
// section does). Shown at most once per IST day per user; silent entirely
// when nothing's due. "View Details" scrolls to the existing section
// instead of duplicating its data here.
export function DashboardAlerts({ summary, userId }: { summary: DashboardSummary; userId: string | null }) {
  const [queue, setQueue] = useState<AlertKind[] | null>(null);

  useEffect(() => {
    if (!userId) {
      setQueue([]);
      return;
    }
    const candidates: AlertKind[] = [];
    if (summary.outstanding_balance_count > 0 && !wasDismissedToday("payment", userId, summary.today)) {
      candidates.push("payment");
    }
    if (summary.due_today.length + summary.overdue.length > 0 && !wasDismissedToday("items", userId, summary.today)) {
      candidates.push("items");
    }
    setQueue(candidates);
    // Deliberately runs once, on mount only — re-deriving this later in the
    // same session (e.g. if summary is refetched) would undo a dismissal
    // the operator already acted on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dismiss(kind: AlertKind) {
    if (userId) markDismissed(kind, userId, summary.today);
    setQueue((q) => (q ?? []).filter((k) => k !== kind));
  }

  function viewDetails(kind: AlertKind, anchorId: string) {
    dismiss(kind);
    // Let the modal unmount first so the scroll target is measured against
    // the final, popup-free layout.
    requestAnimationFrame(() => {
      document.getElementById(anchorId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  if (!queue || queue.length === 0) return null;
  const current = queue[0];

  if (current === "payment") {
    const n = summary.outstanding_balance_count;
    return (
      <Modal onClose={() => dismiss("payment")}>
        <div className="wizard-card alert-modal">
          <h2>Payment Due</h2>
          <p>
            <strong>
              {n} active booking{n === 1 ? "" : "s"}
            </strong>{" "}
            with money still owed — <strong>₹{summary.outstanding_balance}</strong> outstanding in total.
          </p>
          <div className="wizard-actions">
            <button type="button" className="btn-secondary" onClick={() => dismiss("payment")}>
              Dismiss
            </button>
            <button type="button" className="btn-primary" onClick={() => viewDetails("payment", "outstanding-balance-section")}>
              View Details
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  const itemsDueCount = summary.due_today.length + summary.overdue.length;
  const urgentCount = summary.overdue.filter((b) => b.next_customer_waiting).length;
  return (
    <Modal onClose={() => dismiss("items")}>
      <div className="wizard-card alert-modal">
        <h2>Item Due</h2>
        <p>
          <strong>
            {itemsDueCount} item{itemsDueCount === 1 ? "" : "s"}
          </strong>{" "}
          due back today or overdue
          {summary.overdue.length > 0 && (
            <>
              {" "}
              ({summary.overdue.length} overdue
              {urgentCount > 0 ? `, ${urgentCount} with the next customer waiting` : ""})
            </>
          )}
          .
        </p>
        <div className="wizard-actions">
          <button type="button" className="btn-secondary" onClick={() => dismiss("items")}>
            Dismiss
          </button>
          <button type="button" className="btn-primary" onClick={() => viewDetails("items", "items-due-section")}>
            View Details
          </button>
        </div>
      </div>
    </Modal>
  );
}
