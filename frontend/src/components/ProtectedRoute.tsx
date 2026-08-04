import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  // Hold off rendering until the initial session check resolves, so a
  // logged-out visitor never sees the protected page flash before the
  // redirect, and a logged-in visitor never gets bounced to /login on
  // refresh just because the session hasn't loaded back in yet.
  if (loading) return null;

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
