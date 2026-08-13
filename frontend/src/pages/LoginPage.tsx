import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate, type Location } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";

export default function LoginPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && session) {
    const from = (location.state as { from?: Location } | null)?.from?.pathname ?? "/";
    return <Navigate to={from} replace />;
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
    navigate("/", { replace: true });
  }

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center bg-light py-5 px-3">
      <div className="card shadow-sm border-0" style={{ maxWidth: 420, width: "100%" }}>
        <div className="card-body p-4 p-md-5">
          <div className="text-center mb-4">
            <div
              className="icon-shape bg-primary text-white rounded-circle mb-3 mx-auto d-flex align-items-center justify-content-center"
              style={{ width: 56, height: 56 }}
            >
              <i className="ti ti-diamond fs-2"></i>
            </div>
            <h3 className="fw-bold text-dark mb-1">Nitya Gehini Jewels</h3>
            <p className="text-muted small">Sign in to manage your inventory and rentals</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label fw-medium text-dark small">Email Address</label>
              <div className="input-group">
                <span className="input-group-text bg-white border-end-0 text-muted">
                  <i className="ti ti-mail fs-5"></i>
                </span>
                <input
                  type="email"
                  className="form-control border-start-0 ps-0"
                  placeholder="admin@nityagehini.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                  required
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="form-label fw-medium text-dark small">Password</label>
              <div className="input-group">
                <span className="input-group-text bg-white border-end-0 text-muted">
                  <i className="ti ti-lock fs-5"></i>
                </span>
                <input
                  type="password"
                  className="form-control border-start-0 ps-0"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="alert alert-danger py-2 px-3 small rounded mb-3" role="alert">
                <i className="ti ti-alert-circle me-1"></i> {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary w-100 py-2 fw-semibold d-flex align-items-center justify-content-center gap-2"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                  Signing In…
                </>
              ) : (
                <>
                  Sign In <i className="ti ti-arrow-right fs-5"></i>
                </>
              )}
            </button>
          </form>
        </div>
        <div className="card-footer bg-light border-top-0 text-center py-3">
          <small className="text-muted">Nitya Gehini Jewels Admin Portal</small>
        </div>
      </div>
    </div>
  );
}
