import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { apiFetch } from "./api";

export interface UserProfile {
  id: string;
  role: "admin" | "operator";
  name: string;
  email: string;
  photo_url: string | null;
}

interface AuthContextValue {
  session: Session | null;
  // True until the initial session check resolves — callers must not decide
  // to redirect (or render protected content) while this is true, or a
  // logged-in refresh will flash a redirect to /login before the session
  // loads back in.
  loading: boolean;
  // The caller's own app profile (role/name/email/photo_url), fetched once
  // a session exists.
  profile: UserProfile | null;
  // Re-fetches /api/me — called after the profile panel changes the display
  // name or photo, so the header avatar (and anywhere else profile shows up)
  // updates immediately without needing a full page reload.
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
  profile: null,
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      setProfile(await apiFetch<UserProfile>("/api/me"));
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    refreshProfile();
  }, [session, refreshProfile]);

  return <AuthContext.Provider value={{ session, loading, profile, refreshProfile }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
