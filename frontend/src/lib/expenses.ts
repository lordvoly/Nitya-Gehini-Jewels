import { apiFetch } from "./api";

export type ExpenseCategory = "rent" | "utilities" | "salaries" | "stock_purchase" | "marketing" | "misc" | "other";

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "rent",
  "utilities",
  "salaries",
  "stock_purchase",
  "marketing",
  "misc",
  "other",
];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  rent: "Rent",
  utilities: "Utilities",
  salaries: "Salaries",
  stock_purchase: "Stock Purchase",
  marketing: "Marketing",
  misc: "Misc",
  other: "Other",
};

export interface Expense {
  id: string;
  date: string;
  category: ExpenseCategory;
  amount: number;
  description: string | null;
  created_at: string;
}

// Mirrors ReportsResponse's period-echo pattern: from/to are resolved
// server-side (defaulting to the current IST calendar month) and echoed
// back so the frontend never computes "this month" itself.
export interface ExpensesResponse {
  period: { from: string; to: string };
  expenses: Expense[];
}

export interface NewExpense {
  category: ExpenseCategory;
  amount: number;
  // Left null to let the backend default to today in IST.
  date: string | null;
  description: string | null;
}

export function fetchExpenses(params?: { from?: string; to?: string }) {
  const qs = new URLSearchParams();
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  const query = qs.toString();
  return apiFetch<ExpensesResponse>(`/api/expenses${query ? `?${query}` : ""}`);
}

export function createExpense(input: NewExpense) {
  return apiFetch<Expense>("/api/expenses", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
