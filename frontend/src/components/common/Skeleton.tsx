import type { CSSProperties } from "react";

// The one shared shape primitive behind every loading skeleton in the app
// — a page composes its own skeleton LAYOUT (e.g. DashboardSkeleton below,
// or an inline one in BookingDetail) out of these blocks, sized per field
// via width/height, rather than each page inventing its own placeholder
// markup. The shimmer sweep itself lives on .skeleton in shared.css (and
// respects prefers-reduced-motion there), not here.
export function Skeleton({
  width,
  height = 14,
  radius,
  className,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`skeleton${className ? ` ${className}` : ""}`}
      aria-hidden="true"
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

// Matches DashboardPage's real shape: the 2x2 stat-grid, one wide stat
// card, then a couple of list-style rows — so the page doesn't jump/
// reflow when the real content swaps in.
export function DashboardSkeleton() {
  return (
    <div className="page">
      <div className="stat-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} height={78} radius="var(--radius-lg)" />
        ))}
      </div>
      <Skeleton height={70} radius="var(--radius-lg)" style={{ marginBottom: 20 }} />
      <div className="skeleton-stack">
        <Skeleton width="40%" height={17} />
        <Skeleton height={54} radius="var(--radius-lg)" />
        <Skeleton height={54} radius="var(--radius-lg)" />
      </div>
    </div>
  );
}

// Matches BookingDetail's loading shell: a heading line, a customer-name
// line, then a short block of key/value rows. Deliberately just the
// stack, not a full-page wrapper like DashboardSkeleton above — the real
// BookingDetail keeps its own .wizard-card/.wizard-nav (with a working
// Back button) visible during loading, so this only replaces the content
// that goes inside it, not the whole component's output.
export function BookingDetailSkeleton() {
  return (
    <div className="skeleton-stack">
      <Skeleton width="55%" height={24} />
      <Skeleton width="35%" height={14} />
      <Skeleton width="90%" />
      <Skeleton width="70%" />
      <Skeleton width="60%" />
      <Skeleton width="45%" />
    </div>
  );
}

// Matches ReceiptPage/PublicReceiptPage's shape — both receipt views share
// this one skeleton rather than each inventing their own, since they're
// already the same layout end to end. The most externally-visible loading
// state in the app (this is what a customer sees first when they tap a
// WhatsApp-shared invoice link on a cold Render instance), so it gets a
// full dedicated shape rather than the generic page fallback.
export function ReceiptSkeleton() {
  return (
    <div className="page receipt-page">
      <div className="receipt-actions">
        <Skeleton width={160} height={46} radius="var(--radius-pill)" />
      </div>
      <div className="receipt-header">
        <Skeleton width={96} height={96} radius="50%" style={{ margin: "0 auto 8px" }} />
        <Skeleton width="55%" height={21} style={{ margin: "0 auto 8px" }} />
        <Skeleton width="75%" height={13} style={{ margin: "0 auto 4px" }} />
        <Skeleton width="50%" height={13} style={{ margin: "0 auto" }} />
      </div>
      <div className="receipt-meta">
        <div className="skeleton-stack">
          <Skeleton width={70} height={11} />
          <Skeleton width={80} height={18} />
          <Skeleton width={90} height={13} />
        </div>
        <div className="skeleton-stack">
          <Skeleton width={60} height={11} />
          <Skeleton width={100} height={16} />
        </div>
      </div>
      <div className="skeleton-stack">
        <Skeleton height={58} radius="var(--radius-lg)" />
        <Skeleton height={58} radius="var(--radius-lg)" />
      </div>
    </div>
  );
}

// Matches ItemDetailPage's shape: photo, code/name kicker pair, a handful
// of key/value rows, then the Booking History table's heading + rows.
export function ItemDetailSkeleton() {
  return (
    <div className="page">
      <div className="wizard-card">
        <div className="skeleton-stack">
          <Skeleton height={220} radius="var(--radius-lg)" />
          <Skeleton width="30%" height={12.5} />
          <Skeleton width="65%" height={26} />
          <Skeleton width="40%" />
          <Skeleton width="55%" />
          <Skeleton width="35%" />
        </div>
      </div>
      <div className="wizard-card" style={{ marginTop: 16 }}>
        <div className="skeleton-stack">
          <Skeleton width="45%" height={20} />
          <Skeleton height={44} radius="var(--radius)" />
          <Skeleton height={44} radius="var(--radius)" />
        </div>
      </div>
    </div>
  );
}

// A short label/input-shaped stack — SettingsPage's own real shape, and
// generic enough to reuse for any other simple single-form page later.
export function FormSkeleton() {
  return (
    <div className="page">
      <div className="skeleton-stack">
        <Skeleton width="40%" height={24} />
        <Skeleton width="70%" height={14} />
        <Skeleton height={46} radius="var(--radius)" />
        <Skeleton height={46} radius="var(--radius)" />
        <Skeleton height={46} radius="var(--radius)" />
        <Skeleton width={120} height={46} radius="var(--radius-pill)" />
      </div>
    </div>
  );
}

// Reports/Expenses/Charges' shared shape: heading, a filter row, then a
// handful of list/table-style rows — close enough across all three that
// one skeleton serves all of them rather than three near-identical ones.
export function ListPageSkeleton() {
  return (
    <div className="page">
      <div className="skeleton-stack">
        <Skeleton width="35%" height={24} />
        <div style={{ display: "flex", gap: 10 }}>
          <Skeleton height={44} radius="var(--radius)" style={{ flex: 1 }} />
          <Skeleton height={44} radius="var(--radius)" style={{ flex: 1 }} />
        </div>
        <Skeleton height={70} radius="var(--radius-lg)" />
        <Skeleton height={54} radius="var(--radius-lg)" />
        <Skeleton height={54} radius="var(--radius-lg)" />
        <Skeleton height={54} radius="var(--radius-lg)" />
      </div>
    </div>
  );
}
