import { apiFetch, ApiError } from "./api";

export type CustomerType = "regular" | "influencer" | "mua";

export const CUSTOMER_TYPES: CustomerType[] = ["regular", "influencer", "mua"];

export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  regular: "Regular",
  influencer: "Influencer",
  mua: "MUA",
};

export interface Customer {
  id: string;
  name: string;
  phone: string;
  phone_secondary: string | null;
  email: string | null;
  address: string;
  notes: string | null;
  customer_type: CustomerType;
  created_at: string;
}

export interface NewCustomer {
  name: string;
  phone: string;
  phone_secondary: string | null;
  email: string | null;
  address: string;
  notes: string | null;
  customer_type: CustomerType;
}

export function fetchCustomers(search?: string) {
  const qs = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
  return apiFetch<Customer[]>(`/api/customers${qs}`);
}

export function fetchCustomer(id: string) {
  return apiFetch<Customer>(`/api/customers/${id}`);
}

// Plain PATCH, matching updateItem's pattern — a duplicate-phone 409 here
// just surfaces as a normal error message (unlike create's dedupe flow,
// there's no "use this customer instead" affordance while editing).
export function updateCustomer(id: string, input: NewCustomer) {
  return apiFetch<Customer>(`/api/customers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteCustomer(id: string) {
  return apiFetch<{ ok: true }>(`/api/customers/${id}`, { method: "DELETE" });
}

export type CreateCustomerResult =
  | { type: "created"; customer: Customer }
  | { type: "duplicate"; existingCustomer: Customer };

// Phone dedupe happens atomically on the backend. A 409 means a customer with
// this phone already exists — we surface that record instead of throwing, so
// callers (the add-customer form, and eventually a booking screen) can offer
// "use this customer" instead of a dead-end error.
export async function createCustomer(input: NewCustomer): Promise<CreateCustomerResult> {
  try {
    const customer = await apiFetch<Customer>("/api/customers", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return { type: "created", customer };
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      const existingCustomer = (e.body as { existingCustomer?: Customer } | undefined)?.existingCustomer;
      if (existingCustomer) return { type: "duplicate", existingCustomer };
    }
    throw e;
  }
}
