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
