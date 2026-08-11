import { supabase } from "../lib/supabase.js";

/**
 * Tools exposed to Claude Haiku 4.5 in the chat endpoint (Phase 3).
 * Every answer the bot gives must be grounded in one of these — it must
 * never invent a location, price, or availability.
 *
 * NOTE — Checkpoint (a) / preview-branch code: upcoming_returns_v2 /
 * overdue_rentals_v2 are the `_v2`-suffixed views until Stage 2 renames
 * them — see PROJECT_PLAN_V2.md §8.
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
      const { data, error } = await supabase.from("upcoming_returns_v2").select("*");
      if (error) throw error;
      const daysAhead = Number(input.days_ahead ?? 7);
      return (data ?? []).filter((b) => (b.days_until_return ?? Infinity) <= daysAhead);
    }
    case "get_overdue_rentals": {
      const { data, error } = await supabase.from("overdue_rentals_v2").select("*");
      if (error) throw error;
      return data;
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
