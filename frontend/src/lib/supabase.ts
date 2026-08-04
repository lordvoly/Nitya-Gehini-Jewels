import { createClient } from "@supabase/supabase-js";

// Anon key only — used for Auth (login/session) in the browser.
// All data reads/writes go through our own backend API, never straight to
// Supabase from here. See CLAUDE.md.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
