import { createClient, type Session } from "@supabase/supabase-js";

const useMockAuth = !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY;

function createMockSupabaseClient() {
  const mockSession: Session = {
    access_token: "dev-access-token",
    token_type: "bearer",
    refresh_token: "dev-refresh-token",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: "dev-user",
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: new Date().toISOString(),
      email: "dev@example.com",
    },
  };

  return {
    auth: {
      getSession: async () => ({ data: { session: mockSession }, error: null }),
      onAuthStateChange: (callback: (event: string, session: Session | null) => void) => {
        callback("INITIAL_SESSION", mockSession);
        return { data: { subscription: { unsubscribe() {} } } };
      },
      signInWithPassword: async () => ({ data: { session: mockSession }, error: null }),
      signOut: async () => ({ error: null }),
    },
  };
}

export const supabase = (
  useMockAuth
    ? createMockSupabaseClient()
    : createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
) as ReturnType<typeof createClient>;
