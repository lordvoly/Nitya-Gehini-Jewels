import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate, type Location } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import "../styles/shared.css";

// pathname + search, e.g. "/bookings?booking=<id>" — a QR-code deep link or
// any other query-param destination needs both, not just the base path.
function resolveFrom(location: { state: unknown }): string {
  const from = (location.state as { from?: Location } | null)?.from;
  if (!from) return "/";
  return `${from.pathname}${from.search}`;
}

export default function LoginPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in (e.g. navigated to /login directly) — send back to
  // wherever ProtectedRoute bounced from, or the dashboard by default.
  // pathname alone isn't enough: a deep link like /bookings?booking=<id>
  // carries the specific booking in .search, not .pathname — dropping it
  // silently lands on the generic bookings list instead of that booking.
  if (!loading && session) {
    return <Navigate to={resolveFrom(location)} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    // Bug found while building receipt QR codes (2026-08-13): this used to
    // hardcode navigate("/"), always landing on Dashboard regardless of
    // what ProtectedRoute originally bounced the visitor from. The "already
    // signed in" early-return above does read location.state.from
    // correctly, but only helps a visitor who lands on /login while already
    // authenticated — the real login submission path never went through it,
    // since navigating away here unmounts LoginPage before the reactive
    // session-update branch ever gets a chance to run.
    navigate(resolveFrom(location), { replace: true });
  }

  return (
    <div className="page">
      <form className="wizard-card" onSubmit={handleSubmit}>
        <div className="wizard-step">
          <h2>Nitya Gehini Jewels</h2>
          <p className="wizard-hint">Sign in to continue.</p>

          <label className="field-label">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
              required
            />
          </label>
          <label className="field-label">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error && (
            <p className="wizard-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="wizard-nav">
          <button type="submit" className="btn-primary btn-save" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign In"}
          </button>
        </div>
      </form>
    </div>
  );
}
