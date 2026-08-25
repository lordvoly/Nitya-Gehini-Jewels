import { apiFetch, ApiError } from "./api";

export type CustomerType = "regular" | "influencer" | "mua";

export const CUSTOMER_TYPES: CustomerType[] = ["regular", "influencer", "mua"];

export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  regular: "Regular",
  influencer: "Influencer",
  mua: "MUA",
};

// CustomersList's Category filter — "all" plus the three real values.
export type CustomerCategoryFilter = "all" | CustomerType;

export const CUSTOMER_CATEGORY_FILTER_LABELS: Record<CustomerCategoryFilter, string> = {
  all: "All",
  ...CUSTOMER_TYPE_LABELS,
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
  // Plain optional reference dates — never collected before this feature,
  // so existing customers just have both as null. Recurring yearly by
  // month+day (see Dashboard's Upcoming Occasions), not exact-date.
  date_of_birth: string | null;
  date_of_wedding: string | null;
}

export interface NewCustomer {
  name: string;
  phone: string;
  phone_secondary: string | null;
  email: string | null;
  address: string;
  notes: string | null;
  customer_type: CustomerType;
  date_of_birth: string | null;
  date_of_wedding: string | null;
}

export function fetchCustomers(params?: { search?: string; customer_type?: CustomerCategoryFilter }) {
  const extra: Record<string, string> = {};
  if (params?.search?.trim()) extra.search = params.search.trim();
  if (params?.customer_type && params.customer_type !== "all") extra.customer_type = params.customer_type;
  const qs = new URLSearchParams(extra).toString();
  return apiFetch<Customer[]>(`/api/customers${qs ? `?${qs}` : ""}`);
}

export function fetchCustomer(id: string) {
  return apiFetch<Customer>(`/api/customers/${id}`);
}

// total_business is total agreed price across every one of this
// customer's bookings, all-time — cancelled bookings/items already
// contribute ₹0 (booking_financials excludes them) and FOC items too, so
// no extra filtering is needed here. Not the same as how much they've
// actually paid so far (an open balance still counts in full).
export interface CustomerRevenue {
  total_business: number;
  booking_count: number;
}

export function fetchCustomerRevenue(id: string) {
  return apiFetch<CustomerRevenue>(`/api/customers/${id}/revenue`);
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
