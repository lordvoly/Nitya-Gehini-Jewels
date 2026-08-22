import type { CSSProperties } from "react";

// The one shared shape primitive behind every loading skeleton in the app
// — a page composes its own skeleton LAYOUT (e.g. DashboardSkeleton below,
// or an inline one in BookingDetail) out of these blocks, sized per field
// via width/height, rather than each page inventing its own placeholder
// markup. Static on purpose in this stage — no shimmer/pulse — see the
// comment on .skeleton in shared.css for why.
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
