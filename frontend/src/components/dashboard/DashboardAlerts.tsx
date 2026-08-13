import { useEffect, useState } from "react";
import { Modal } from "../common/Modal";
import type { DashboardSummary } from "../../lib/dashboard";

type AlertKind = "payment" | "items";

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
  } catch {}
}

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
  }, []);

  function dismiss(kind: AlertKind) {
    if (userId) markDismissed(kind, userId, summary.today);
    setQueue((q) => (q ?? []).filter((k) => k !== kind));
  }

  function viewDetails(kind: AlertKind, anchorId: string) {
    dismiss(kind);
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
        <div className="modal-header border-bottom py-3">
          <h5 className="modal-title fw-bold text-dark d-flex align-items-center gap-2">
            <i className="ti ti-receipt-refund text-warning"></i> Payment Due Reminder
          </h5>
          <button type="button" className="btn-close" onClick={() => dismiss("payment")}></button>
        </div>
        <div className="modal-body p-4">
          <p className="fs-6 text-dark mb-2">
            You have <strong>{n} active booking{n === 1 ? "" : "s"}</strong> with money still owed.
          </p>
          <div className="alert alert-warning py-2 px-3 fw-bold fs-5 text-warning mb-0">
            Total Outstanding: ₹{summary.outstanding_balance.toLocaleString("en-IN")}
          </div>
        </div>
        <div className="modal-footer border-top bg-light p-3">
          <button type="button" className="btn btn-outline-secondary" onClick={() => dismiss("payment")}>
            Dismiss
          </button>
          <button type="button" className="btn btn-primary" onClick={() => viewDetails("payment", "outstanding-balance-section")}>
            View Details
          </button>
        </div>
      </Modal>
    );
  }

  const itemsDueCount = summary.due_today.length + summary.overdue.length;
  const urgentCount = summary.overdue.filter((b) => b.next_customer_waiting).length;
  return (
    <Modal onClose={() => dismiss("items")}>
      <div className="modal-header border-bottom py-3">
        <h5 className="modal-title fw-bold text-dark d-flex align-items-center gap-2">
          <i className="ti ti-calendar-event text-danger"></i> Rental Items Due Reminder
        </h5>
        <button type="button" className="btn-close" onClick={() => dismiss("items")}></button>
      </div>
      <div className="modal-body p-4">
        <p className="fs-6 text-dark mb-2">
          There are <strong>{itemsDueCount} item{itemsDueCount === 1 ? "" : "s"}</strong> due back today or overdue.
        </p>
        {summary.overdue.length > 0 && (
          <div className="alert alert-danger py-2 px-3 small mb-0">
            <i className="ti ti-alert-triangle me-1"></i> {summary.overdue.length} items overdue
            {urgentCount > 0 ? ` (${urgentCount} next customer waiting)` : ""}
          </div>
        )}
      </div>
      <div className="modal-footer border-top bg-light p-3">
        <button type="button" className="btn btn-outline-secondary" onClick={() => dismiss("items")}>
          Dismiss
        </button>
        <button type="button" className="btn btn-primary" onClick={() => viewDetails("items", "items-due-section")}>
          View Details
        </button>
      </div>
    </Modal>
  );
}
