import { supabase } from "./supabase.js";
import { istToday } from "./dates.js";

export interface RecordPaymentInput {
  bookingId: string;
  amount: number;
  method: string;
  paymentDate?: string | null;
  notes?: string | null;
  recordedBy: string | null;
}

// Same validation + insert shape as POST /api/payments (routes/payments.ts,
// the "Record Payment" action) — extracted here so any other route that
// needs to record a real payment (e.g. Confirm Pickup) calls this exact
// logic instead of re-implementing it. Throws on invalid input or a DB
// error; callers decide how to surface that (a 400 for the direct route,
// a non-blocking warning for a secondary action like Confirm Pickup).
export async function recordPayment(input: RecordPaymentInput) {
  if (!input.bookingId || input.amount == null || !input.method) {
    throw new Error("booking_id, amount, and method are required");
  }
  if (input.amount <= 0) {
    throw new Error("amount must be greater than 0");
  }
  const { data, error } = await supabase
    .from("payments")
    .insert({
      booking_id: input.bookingId,
      amount: input.amount,
      method: input.method,
      type: "payment",
      payment_date: input.paymentDate || istToday(),
      notes: input.notes?.trim() || null,
      recorded_by: input.recordedBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
