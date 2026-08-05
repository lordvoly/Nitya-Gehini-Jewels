import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { apiFetch } from "./api";

export interface UserProfile {
  id: string;
  role: "admin" | "operator";
  name: string;
  email: string;
}

interface AuthContextValue {
  session: Session | null;
  // True until the initial session check resolves — callers must not decide
  // to redirect (or render protected content) while this is true, or a
  // logged-in refresh will flash a redirect to /login before the session
  // loads back in.
  loading: boolean;
  // The caller's own app profile (role/name/email), fetched once a session
  // exists. Not used to gate anything today — kept available so role-based
  // UI (e.g. admin-only reports) is a small change later, not a rewrite.
  profile: UserProfile | null;
}

const AuthContext = createContext<AuthContextValue>({ session: null, loading: true, profile: null });

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

  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    apiFetch<UserProfile>("/api/me").then(setProfile).catch(() => setProfile(null));
  }, [session]);

  return <AuthContext.Provider value={{ session, loading, profile }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
