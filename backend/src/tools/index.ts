import { supabase } from "../lib/supabase.js";
import { istMonthRange } from "../lib/dates.js";
import {
  getPeriodBookingItems,
  rankMostBookedItems,
  getAllBookingItems,
  rankRepeatCustomers,
  getIdleInventory,
  getFinancialSummary,
  getOutstandingDues,
  getItemBookingItems,
  getRevenueBreakdown,
} from "../lib/reportsData.js";
import { getDailyBriefingData, getUpcomingPickupsForDays } from "../lib/dashboardData.js";
import { getItemCharges } from "../routes/itemCharges.js";
import { getBookingDetail, checkUniqueRentalConflicts, getQuantityAvailability } from "../routes/bookings.js";
import { getPaymentsForBooking } from "../routes/payments.js";
import { resolveItemByCodeOrName } from "../lib/itemsData.js";
import { searchCustomers, getCustomerHistory } from "../lib/customersData.js";

/**
 * Tools exposed to Claude Haiku 4.5 in the chat endpoint (Phase 3).
 * Every answer the bot gives must be grounded in one of these — it must
 * never invent a location, price, or availability.
 *
 * The reporting/dashboard/booking-detail tools below (get_financial_summary
 * through get_booking_by_code) deliberately call the exact same functions
 * already backing Reports/Dashboard/BookingDetail (see
 * backend/src/lib/reportsData.ts, backend/src/lib/dashboardData.ts, and the
 * exported helpers in routes/itemCharges.ts, routes/bookings.ts,
 * routes/payments.ts) rather than reimplementing any of those queries here.
 */

export const toolDefinitions = [
  {
    name: "search_items",
    description: "Find items by name or category.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Free-text search over item name" },
        category: { type: "string", description: "Optional exact category filter" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_item_status",
    description: "Current status, location, and next booking for one item.",
    input_schema: {
      type: "object" as const,
      properties: { item_code: { type: "string" } },
      required: ["item_code"],
    },
  },
  {
    name: "get_item_availability",
    description:
      "Is ONE SPECIFIC item free for a given date range — a hypothetical check for questions like 'is the Peacock Set free 19-22 Sept' or 'how many bangles are left for next weekend'. Looked up by item code or name (not an internal id). For a unique item: yes/no, and if no, the real conflicting booking(s) (code + dates). For a quantity-tracked item: units free out of the total for that range. Reports when the item can't be resolved rather than guessing. Distinct from get_item_status (that item's CURRENT status/location right now, no date range involved) and from get_upcoming_pickups/get_overdue_rentals (whole-shop lists, not one item's hypothetical range).",
    input_schema: {
      type: "object" as const,
      properties: {
        item_code_or_name: { type: "string", description: "The item's code (e.g. NGJ-0013) or name" },
        start_date: { type: "string", description: "YYYY-MM-DD" },
        end_date: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["item_code_or_name", "start_date", "end_date"],
    },
  },
  {
    name: "get_customer_history",
    description:
      "ONE customer's own booking history, looked up by name (also matches on phone digits if given one). Every booking they've ever made — active, completed, and cancelled, labeled distinctly — plus how much they've actually paid in total and their current outstanding balance. If the name matches more than one real customer, reports the ambiguity and lists candidates instead of guessing which one. This is about a single named customer — distinct from get_outstanding_dues (every customer who currently owes money, shop-wide) and from get_financial_summary/get_item_revenue (shop-wide or one-item revenue, not one customer's own spend).",
    input_schema: {
      type: "object" as const,
      properties: { customer_name: { type: "string", description: "Customer's name (or phone number)" } },
      required: ["customer_name"],
    },
  },
  {
    name: "get_upcoming_returns",
    description: "Rentals due back within the next N days.",
    input_schema: {
      type: "object" as const,
      properties: { days_ahead: { type: "number" } },
      required: ["days_ahead"],
    },
  },
  {
    name: "get_overdue_rentals",
    description: "Rentals that are currently overdue.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_upcoming_pickups",
    description:
      "Items scheduled to go OUT to a customer soon — still status='booked', not yet picked up/handed over. Use this for any question about items going out, being picked up, or being handed over next (e.g. 'what's going out next', 'what needs to be picked up today/this week', 'what am I handing over'). This is the OPPOSITE of get_upcoming_returns/get_overdue_rentals/get_daily_briefing, which are all about items coming BACK to the shop — never reach for those on a 'going out' question, even if no other tool seems to fit. Covers both rentals and sales, since a sale customer collecting their purchase is also a pickup.",
    input_schema: {
      type: "object" as const,
      properties: { days_ahead: { type: "number", description: "How many days ahead to look. Defaults to 7." } },
    },
  },
  {
    name: "get_customer_summary",
    description: "Total customer count, broken down by type (regular/influencer/mua), plus the full customer list.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_financial_summary",
    description:
      "OUR revenue — the whole shop's, across every item — plus expenses, net profit, a received/balance-remaining breakdown, AND how many bookings happened (total_bookings, plus rental_count/sale_count) for a period. This is also the right tool for a plain 'how many bookings did we have this month/week' question, not just money questions. Defaults to the current IST calendar month if no dates are given. The period filters by pickup/rental start date (pickup_date), same as everything else in this app that's scoped to 'this week'/'this month'. revenue and grand_total are the same figure (total agreed price, cancelled items excluded entirely) — received is how much of that has actually been paid so far, balance_remaining is what's still owed; received + balance_remaining always equals grand_total exactly. total_bookings counts family transactions (one visit, however many items); rental_count/sale_count count individual items instead, so a visit with one rental and one sale adds 1 to both. Covers both rentals and sales, and both unique and quantity-tracked items. For ONE item's own revenue instead of the whole shop's, use get_item_revenue, never this.",
    input_schema: {
      type: "object" as const,
      properties: {
        from: { type: "string", description: "YYYY-MM-DD, defaults to the start of the current month" },
        to: { type: "string", description: "YYYY-MM-DD, defaults to the end of the current month" },
      },
    },
  },
  {
    name: "get_item_revenue",
    description:
      "ONE SPECIFIC item's own revenue — received / balance remaining / grand total for just that item, all-time by default (optional pickup-date range). Uses the exact same cancelled-exclusion and payment-proration rules as get_financial_summary, just scoped to one item instead of the whole shop. This is revenue EARNED, not profit or ROI — there's no item acquisition cost tracked in this app, so no cost/margin figure is computed here. For the whole shop's revenue instead of one item's, use get_financial_summary, never this.",
    input_schema: {
      type: "object" as const,
      properties: {
        item_code: { type: "string", description: "The item's code, e.g. NGJ-0013" },
        from: { type: "string", description: "YYYY-MM-DD, optional — all-time if omitted" },
        to: { type: "string", description: "YYYY-MM-DD, optional — all-time if omitted" },
      },
      required: ["item_code"],
    },
  },
  {
    name: "get_outstanding_dues",
    description: "Every booking that currently owes money, sorted by balance due, highest first.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_outstanding_charges",
    description: "Every unresolved lost-or-damaged-item charge, with the booking, item, and customer it belongs to.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_popular_items",
    description:
      "Most-booked items over a period. Defaults to the current IST calendar month if no dates are given. Excludes influencer/MUA bookings unless include_collabs is explicitly set — set it true only if the question itself asks to include collabs/influencers.",
    input_schema: {
      type: "object" as const,
      properties: {
        from: { type: "string", description: "YYYY-MM-DD, defaults to the start of the current month" },
        to: { type: "string", description: "YYYY-MM-DD, defaults to the end of the current month" },
        include_collabs: { type: "boolean", description: "Include influencer/MUA bookings in the ranking. Defaults to false." },
      },
    },
  },
  {
    name: "get_idle_inventory",
    description: "Active items with no booking in the last 90 days, or never booked at all. Retired items are excluded.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_repeat_customers",
    description:
      "Customers with more than one booking, ranked by booking count (highest first) — this is THE tool for 'who is our most repeated/frequent/loyal customer' or 'which customers have booked more than once'. All-time by design, never scoped to a date range (a customer's repeat status is a lifetime fact, not a this-month one) — ignore any dates mentioned in the question. Excludes influencer/MUA bookings unless include_collabs is explicitly set, same convention as get_popular_items. Do NOT answer this kind of question by calling get_customer_summary followed by get_customer_history on every customer one by one — always reach for this tool directly instead, in a single call.",
    input_schema: {
      type: "object" as const,
      properties: {
        include_collabs: { type: "boolean", description: "Include influencer/MUA bookings. Defaults to false." },
      },
    },
  },
  {
    name: "get_daily_briefing",
    description:
      "A single combined status check: today's returns due, currently overdue rentals (flagging which ones have the next customer already waiting), and the current outstanding-payment total and count. This is about items coming BACK only — for anything about items going OUT to a customer (pickups, hand-overs), use get_upcoming_pickups instead, even for a general 'catch me up' question that turns out to be about pickups.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_booking_by_code",
    description: "Full status of one specific booking looked up by its booking_code (e.g. BK-0001) — every item, dates, balance due, and payment history.",
    input_schema: {
      type: "object" as const,
      properties: { booking_code: { type: "string" } },
      required: ["booking_code"],
    },
  },
];

export async function runTool(name: string, input: Record<string, unknown>) {
  switch (name) {
    case "search_items": {
      let query = supabase.from("items").select("*").ilike("name", `%${input.query}%`);
      if (input.category) query = query.eq("category", input.category as string);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    }
    case "get_item_status": {
      // items no longer has a direct FK to bookings — item_id now lives on
      // booking_items, so the embed goes through that instead.
      const { data, error } = await supabase
        .from("items")
        .select("*, booking_items(*, bookings(booking_code, customer_id))")
        .eq("item_code", input.item_code)
        .single();
      if (error) throw error;
      return data;
    }
    case "get_item_availability": {
      const resolved = await resolveItemByCodeOrName(String(input.item_code_or_name ?? ""));
      if ("error" in resolved) return resolved;
      const { item } = resolved;
      const startDate = String(input.start_date);
      const endDate = String(input.end_date);

      if (item.tracking_type === "unique") {
        if (item.status !== "available") {
          return { item_code: item.item_code, name: item.name, tracking_type: "unique", available: false, reason: `Item status is '${item.status}'`, conflicts: [] };
        }
        const conflicts = await checkUniqueRentalConflicts(item.id, startDate, endDate);
        return {
          item_code: item.item_code,
          name: item.name,
          tracking_type: "unique",
          available: conflicts.length === 0,
          conflicts: conflicts.map((c) => {
            const booking = c.bookings as unknown as { booking_code: string; customers: { name: string } | null } | null;
            return { booking_code: booking?.booking_code ?? null, customer_name: booking?.customers?.name ?? null, pickup_date: c.pickup_date, return_date: c.return_date };
          }),
        };
      }

      const { total, available } = await getQuantityAvailability(item.id, item.quantity_on_hand, startDate, endDate);
      return {
        item_code: item.item_code,
        name: item.name,
        tracking_type: "quantity",
        total_units: total,
        available_units: Math.max(available, 0),
        range: { start_date: startDate, end_date: endDate },
      };
    }
    case "get_customer_history": {
      const term = String(input.customer_name ?? "");
      const matches = await searchCustomers(term);
      if (matches.length === 0) return { error: `No customer found matching "${term}"` };
      if (matches.length > 1) {
        return {
          error: `"${term}" matches more than one customer — ask which one is meant.`,
          candidates: matches.map((c) => ({ name: c.name, phone: c.phone })),
        };
      }
      const customer = matches[0];
      const bookings = await getCustomerHistory(customer.id);
      return {
        customer_name: customer.name,
        phone: customer.phone,
        customer_type: customer.customer_type,
        total_bookings: bookings.length,
        // Actual money paid across every booking, not the agreed total —
        // see get_financial_summary's own received/grand_total split for
        // why these are kept distinct rather than one blended figure.
        total_spent: bookings.reduce((sum, b) => sum + b.total_paid, 0),
        outstanding_balance: bookings.reduce((sum, b) => sum + b.balance_due, 0),
        bookings,
      };
    }
    case "get_upcoming_returns": {
      const { data, error } = await supabase.from("upcoming_returns").select("*");
      if (error) throw error;
      const daysAhead = Number(input.days_ahead ?? 7);
      return (data ?? []).filter((b) => (b.days_until_return ?? Infinity) <= daysAhead);
    }
    case "get_overdue_rentals": {
      const { data, error } = await supabase.from("overdue_rentals").select("*");
      if (error) throw error;
      return data;
    }
    case "get_upcoming_pickups": {
      const daysAhead = Number(input.days_ahead ?? 7);
      return await getUpcomingPickupsForDays(daysAhead);
    }
    case "get_customer_summary": {
      const { data, error } = await supabase.from("customers").select("name, phone, customer_type").order("name");
      if (error) throw error;
      const customers = data ?? [];
      const by_type: Record<string, number> = {};
      for (const c of customers) by_type[c.customer_type] = (by_type[c.customer_type] ?? 0) + 1;
      return { total_count: customers.length, by_type, customers };
    }
    case "get_financial_summary": {
      const defaultRange = istMonthRange();
      const from = typeof input.from === "string" && input.from ? input.from : defaultRange.from;
      const to = typeof input.to === "string" && input.to ? input.to : defaultRange.to;
      return { period: { from, to }, ...(await getFinancialSummary(from, to)) };
    }
    case "get_item_revenue": {
      const resolved = await resolveItemByCodeOrName(String(input.item_code ?? ""));
      if ("error" in resolved) return resolved;
      const { item } = resolved;
      const from = typeof input.from === "string" && input.from ? input.from : undefined;
      const to = typeof input.to === "string" && input.to ? input.to : undefined;
      const itemItems = await getItemBookingItems(item.id, from, to);
      const breakdown = await getRevenueBreakdown(itemItems);
      return {
        item_code: item.item_code,
        name: item.name,
        period: from || to ? { from: from ?? null, to: to ?? null } : "all-time",
        booking_count: new Set(itemItems.map((i) => i.booking_id)).size,
        ...breakdown,
      };
    }
    case "get_outstanding_dues": {
      return await getOutstandingDues();
    }
    case "get_outstanding_charges": {
      return await getItemCharges(false);
    }
    case "get_popular_items": {
      const defaultRange = istMonthRange();
      const from = typeof input.from === "string" && input.from ? input.from : defaultRange.from;
      const to = typeof input.to === "string" && input.to ? input.to : defaultRange.to;
      const includeCollabs = input.include_collabs === true;
      const periodItems = await getPeriodBookingItems(from, to);
      return { period: { from, to }, include_collabs: includeCollabs, most_booked_items: rankMostBookedItems(periodItems, includeCollabs) };
    }
    case "get_idle_inventory": {
      return await getIdleInventory();
    }
    case "get_repeat_customers": {
      const includeCollabs = input.include_collabs === true;
      const allItems = await getAllBookingItems();
      return { include_collabs: includeCollabs, repeat_customers: rankRepeatCustomers(allItems, includeCollabs) };
    }
    case "get_daily_briefing": {
      return await getDailyBriefingData();
    }
    case "get_booking_by_code": {
      const code = String(input.booking_code ?? "").trim();
      const { data: match, error } = await supabase.from("bookings").select("id").eq("booking_code", code).maybeSingle();
      if (error) throw error;
      if (!match) return { error: `No booking found with code ${code}` };
      const [detail, payments] = await Promise.all([getBookingDetail(match.id), getPaymentsForBooking(match.id)]);
      return { ...detail, payments };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
