import { apiFetch } from "./api";

export type PaymentMethod = "cash" | "UPI" | "card" | "bank_transfer" | "other";

export const PAYMENT_METHODS: PaymentMethod[] = ["cash", "UPI", "card", "bank_transfer", "other"];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  UPI: "UPI",
  card: "Card",
  bank_transfer: "Bank Transfer",
  other: "Other",
};

export type PaymentType = "payment" | "refund";

export interface Payment {
  id: string;
  booking_id: string;
  amount: number;
  payment_date: string;
  method: PaymentMethod;
  // Always present from the backend now — a plain 'payment' amount can
  // still be negative (a lost-item charge recorded at return time; see
  // the refund-infrastructure migration's sign-convention note), so this
  // label is what actually distinguishes "money in" bookkeeping from a
  // real refund, not the sign alone.
  type: PaymentType;
  notes: string | null;
  created_at: string;
}

export interface NewPayment {
  booking_id: string;
  amount: number;
  method: PaymentMethod;
  // Left null to let the backend default to today in IST — never computed
  // client-side, same reasoning as actual_return_date on ReturnForm.
  payment_date: string | null;
  notes: string | null;
}

export function fetchPayments(bookingId: string) {
  return apiFetch<Payment[]>(`/api/payments?booking_id=${encodeURIComponent(bookingId)}`);
}

export function recordPayment(input: NewPayment) {
  return apiFetch<Payment>("/api/payments", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// Full audit-trail entry for one payment amount correction — old/new
// amount, the mandatory reason, and who/when. Never overwritten; a payment
// edited twice has two of these.
export interface PaymentAmountEdit {
  id: string;
  payment_id: string;
  old_amount: number;
  new_amount: number;
  reason: string;
  edited_by_name: string | null;
  edited_at: string;
}

export function fetchPaymentEdits(bookingId: string) {
  return apiFetch<PaymentAmountEdit[]>(`/api/payments/edits?booking_id=${encodeURIComponent(bookingId)}`);
}

// Corrects one payment's amount — a real mandatory-reason exception to the
// "locked once Completed" rule every other financial field on a booking
// follows (price_charged, dates, is_foc). Scoped to amount only; nothing
// else about the payment is editable through this call.
export function editPaymentAmount(paymentId: string, newAmount: number, reason: string) {
  return apiFetch<Payment>(`/api/payments/${paymentId}`, {
    method: "PATCH",
    body: JSON.stringify({ new_amount: newAmount, reason }),
  });
}
