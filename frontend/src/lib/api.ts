import { supabase } from "./supabase";

// VITE_API_URL points at the deployed backend in production (Render). Falls
// back to the local dev server so this works even without a .env file.
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // FormData (photo uploads) must not get a manual Content-Type — the browser
  // sets one with the correct multipart boundary itself.
  const isFormData = init?.body instanceof FormData;
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(await authHeader()),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new ApiError(body.error ?? `Request to ${path} failed with ${res.status}`, res.status, body);
    throw err;
  }
  return res.json();
}

// Thrown by apiFetch on a non-OK response. Carries the response status and
// parsed JSON body so callers that need more than the error message (e.g. a
// 409 duplicate-phone response with the existing record attached) can get it
// without a bespoke fetch call.
export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}
