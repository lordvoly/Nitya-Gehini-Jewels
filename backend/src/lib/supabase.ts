import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

// Service-role client: full DB access, bypasses RLS. This key must never
// reach the frontend — only this backend process holds it.
export const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});
