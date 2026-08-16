import { supabase } from "../lib/supabase.js";
import { istMonthRange } from "../lib/dates.js";
import {
  getPeriodBookingItems,
  rankMostBookedItems,
  getIdleInventory,
  getFinancialSummary,
  getOutstandingDues,
} from "../lib/reportsData.js";
import { getDailyBriefingData, getUpcomingPickupsForDays } from "../lib/dashboardData.js";
import { getItemCharges } from "../routes/itemCharges.js";
import { getBookingDetail } from "../routes/bookings.js";
import { getPaymentsForBooking } from "../routes/payments.js";

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
    name: "check_availability",
    description: "Whether an item is free for a hypothetical new booking date range.",
    input_schema: {
      type: "object" as const,
      properties: {
        item_id: { type: "string" },
        start_date: { type: "string", description: "YYYY-MM-DD" },
        end_date: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["item_id", "start_date", "end_date"],
    },
  },
  {
    name: "get_customer_history",
    description: "Past bookings for a customer, looked up by phone or name.",
    input_schema: {
      type: "object" as const,
      properties: { phone_or_name: { type: "string" } },
      required: ["phone_or_name"],
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
    description: "Revenue, expenses, and net profit for a period. Defaults to the current IST calendar month if no dates are given.",
    input_schema: {
      type: "object" as const,
      properties: {
        from: { type: "string", description: "YYYY-MM-DD, defaults to the start of the current month" },
        to: { type: "string", description: "YYYY-MM-DD, defaults to the end of the current month" },
      },
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
    case "check_availability": {
      const { data, error } = await supabase
        .from("booking_items")
        .select("*")
        .eq("item_id", input.item_id)
        .in("status", ["booked", "out"])
        .lte("pickup_date", input.end_date as string)
        .gte("return_date", input.start_date as string);
      if (error) throw error;
      return { available: (data?.length ?? 0) === 0, conflicting_bookings: data };
    }
    case "get_customer_history": {
      const term = String(input.phone_or_name);
      const { data: customers, error: custError } = await supabase
        .from("customers")
        .select("*")
        .or(`phone.eq.${term},name.ilike.%${term}%`);
      if (custError) throw custError;
      if (!customers?.length) return [];
      const customerIds = customers.map((c) => c.id);
      const { data: bookings, error: bookingError } = await supabase
        .from("bookings")
        .select("*, booking_items(*, items(item_code, name))")
        .in("customer_id", customerIds);
      if (bookingError) throw bookingError;
      return { customers, bookings };
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
