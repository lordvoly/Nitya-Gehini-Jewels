import type { DashboardSummary } from "./dashboard";
import { formatNumber } from "./format";

// Powers DashboardPage's "Hi {name} — here's your overview" panel.
// Deliberately computed from the exact DashboardSummary the page already
// fetched, NOT a second call to the AI assistant's chat endpoint — this
// panel is styled to look like the assistant (same Sparkles/wine badge as
// the "Ask" nav tab) but the numbers are read directly off real,
// already-loaded data. Same "grounded, never invented" rule the actual AI
// tools follow, and it means the very first thing Dashboard shows never
// depends on an extra network round-trip to Anthropic (which also has no
// local key in dev — see backend/src/routes/chat.ts's own notes). Mirrors
// get_daily_briefing's fields (backend/src/tools/index.ts) so the two
// "catch me up" surfaces can't quietly diverge.
export function buildDashboardOverview(summary: DashboardSummary): string {
  const parts: string[] = [];

  const returnsDue = summary.due_today.length;
  if (returnsDue > 0) parts.push(`${returnsDue} return${returnsDue === 1 ? "" : "s"} due today`);

  const overdueCount = summary.overdue.length;
  if (overdueCount > 0) {
    const waiting = summary.overdue.filter((o) => o.next_customer_waiting).length;
    parts.push(
      `${overdueCount} overdue rental${overdueCount === 1 ? "" : "s"}${
        waiting > 0 ? ` (${waiting} with the next customer already waiting)` : ""
      }`
    );
  }

  const pickupsOverdueCount = summary.pickups_overdue.length;
  if (pickupsOverdueCount > 0) parts.push(`${pickupsOverdueCount} pickup${pickupsOverdueCount === 1 ? "" : "s"} overdue`);

  const pickupsDueCount = summary.pickups_due_today.length;
  if (pickupsDueCount > 0) parts.push(`${pickupsDueCount} pickup${pickupsDueCount === 1 ? "" : "s"} due today`);

  if (summary.outstanding_balance > 0) {
    parts.push(
      `₹${formatNumber(summary.outstanding_balance)} outstanding across ${summary.outstanding_balance_count} booking${
        summary.outstanding_balance_count === 1 ? "" : "s"
      }`
    );
  }

  if (summary.occasions_today.length > 0) {
    parts.push(`${summary.occasions_today.length} customer occasion${summary.occasions_today.length === 1 ? "" : "s"} today`);
  }

  if (parts.length === 0) return "All caught up — nothing due today.";
  if (parts.length === 1) return `${parts[0]}.`;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}.`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}.`;
}

// "Aryan Batheja" -> "Aryan" — a first-name greeting reads friendlier on
// every visit than the full name repeated back each time.
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}
