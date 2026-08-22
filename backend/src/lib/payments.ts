import { supabase } from "./supabase.js";
import { istToday } from "./dates.js";

export interface EditPaymentAmountInput {
  paymentId: string;
  newAmount: number;
  reason: string;
  editedBy: string | null;
}

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

// The one place a payment's amount can change after creation — a real
// mis-entered amount (e.g. a typo'd advance), not the create-a-new-row
// flow above. Deliberately a sibling function, not a call into
// recordPayment(): the amount bound here is >= 0 (a correction can
// legitimately zero out a mistaken entry), not recordPayment's > 0, and
// there's no status/computed_status gate at all — available even on a
// Completed booking, unlike every other financial field on a booking
// (price_charged, dates, is_foc), which stay locked. That's a deliberate,
// narrow exception for this one field, not a general reopening.
//
// Scoped to type='payment' rows only — a refund or lost-item-charge row
// has its own resolution mechanism (item_charges.resolved, the
// cancel-with-refund flow) and editing its amount directly here would
// desync those, so it's rejected rather than silently allowed.
//
// The actual UPDATE + audit-log INSERT run together inside
// edit_payment_amount() (one Postgres transaction, see the migration) —
// a log-write failure must roll back the amount change, not leave the two
// out of sync, so this can't be two separate non-transactional writes the
// way some other secondary writes in this app are.
export async function editPaymentAmount(input: EditPaymentAmountInput) {
  if (!input.paymentId) {
    throw new Error("payment_id is required");
  }
  const newAmount = Number(input.newAmount);
  if (input.newAmount == null || !Number.isFinite(newAmount) || newAmount < 0) {
    throw new Error("new_amount must be a valid non-negative number");
  }
  const reason = input.reason?.trim() ?? "";
  if (!reason) {
    throw new Error("A reason is required to edit a payment");
  }

  const { data: existing, error: fetchError } = await supabase
    .from("payments")
    .select("id, type")
    .eq("id", input.paymentId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!existing) throw new Error("Payment not found");
  if (existing.type !== "payment") {
    throw new Error("Only regular payments can be edited this way — refunds and charges are managed through their own flows.");
  }

  const { data, error } = await supabase.rpc("edit_payment_amount", {
    p_payment_id: input.paymentId,
    p_new_amount: newAmount,
    p_reason: reason,
    p_edited_by: input.editedBy,
  });
  if (error) throw error;
  return data;
}

// Shared by GET /edits below and (if ever needed) other read paths — full
// audit history for every payment on one booking, newest first. Two plain
// queries rather than a nested-embed filter through payment_id ->
// payments.booking_id: this codebase's own established preference when a
// filter would otherwise depend on subtle to-one-embed PostgREST semantics
// that aren't already proven elsewhere in this file.
export async function getPaymentEditsForBooking(bookingId: string) {
  const { data: bookingPayments, error: paymentsError } = await supabase
    .from("payments")
    .select("id")
    .eq("booking_id", bookingId);
  if (paymentsError) throw paymentsError;
  const paymentIds = (bookingPayments ?? []).map((p) => p.id as string);
  if (paymentIds.length === 0) return [];

  const { data, error } = await supabase
    .from("payment_amount_edits")
    .select("*, users(name)")
    .in("payment_id", paymentIds)
    .order("edited_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    payment_id: row.payment_id as string,
    old_amount: row.old_amount as number,
    new_amount: row.new_amount as number,
    reason: row.reason as string,
    edited_by_name: (row.users as { name: string } | null)?.name ?? null,
    edited_at: row.edited_at as string,
  }));
}
