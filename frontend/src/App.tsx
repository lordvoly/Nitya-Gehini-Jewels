import { useEffect, useState } from "react";
import { Routes, Route, NavLink, Link } from "react-router-dom";
import { Home, Calendar, Gem, Users, Sparkles, Menu, BarChart3, Wallet, AlertCircle } from "lucide-react";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ItemsPage from "./pages/ItemsPage";
import CustomersPage from "./pages/CustomersPage";
import BookingsPage from "./pages/BookingsPage";
import ReportsPage from "./pages/ReportsPage";
import ExpensesPage from "./pages/ExpensesPage";
import ChargesPage from "./pages/ChargesPage";
import AssistantPage from "./pages/AssistantPage";
import ProtectedRoute from "./components/ProtectedRoute";
import { Modal } from "./components/common/Modal";
import { useAuth } from "./lib/auth";
import { supabase } from "./lib/supabase";
import "./styles/shared.css";

// Desktop keeps every page directly reachable in one row — no space
// constraint there, so no need to split anything into a "more" bucket.
const TABS = [
  { to: "/", label: "Dashboard" },
  { to: "/items", label: "Items" },
  { to: "/customers", label: "Customers" },
  { to: "/bookings", label: "Bookings" },
  { to: "/reports", label: "Reports" },
  { to: "/expenses", label: "Expenses" },
  { to: "/charges", label: "Charges" },
  { to: "/assistant", label: "Ask" },
];

// Mobile's primary bar only has room for the 4 highest-frequency
// destinations, icon-only — everything else moves to the FAB (Assistant)
// or the "More" sheet below.
const MOBILE_PRIMARY_TABS = [
  { to: "/", label: "Dashboard", Icon: Home },
  { to: "/bookings", label: "Bookings", Icon: Calendar },
  { to: "/items", label: "Items", Icon: Gem },
  { to: "/customers", label: "Customers", Icon: Users },
];

// Not part of the primary 4 and not frequent enough for a dedicated FAB —
// Charges isn't named in the original split (Reports/Expenses) but leaving
// it unreachable on mobile would be a real regression, so it lives here too.
const MOBILE_MORE_ITEMS = [
  { to: "/reports", label: "Reports", Icon: BarChart3 },
  { to: "/expenses", label: "Expenses", Icon: Wallet },
  { to: "/charges", label: "Charges", Icon: AlertCircle },
];

export default function App() {
  const { session } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!moreOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [moreOpen]);

  return (
    <div>
      <header className="app-header">
        <NavLink to="/" className="app-brand">
          Nitya Gehini Jewels
        </NavLink>
        {session && (
          <button className="btn-secondary" onClick={() => supabase.auth.signOut()}>
            Log Out
          </button>
        )}
      </header>

      <main className={session ? "app-content" : undefined}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/items"
            element={
              <ProtectedRoute>
                <ItemsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/customers"
            element={
              <ProtectedRoute>
                <CustomersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bookings"
            element={
              <ProtectedRoute>
                <BookingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <ReportsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/expenses"
            element={
              <ProtectedRoute>
                <ExpensesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/charges"
            element={
              <ProtectedRoute>
                <ChargesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/assistant"
            element={
              <ProtectedRoute>
                <AssistantPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>

      {session && (
        <nav className="app-tabbar">
          {TABS.map((tab) => (
            <NavLink key={tab.to} to={tab.to} end={tab.to === "/"} className={({ isActive }) => (isActive ? "app-tab active" : "app-tab")}>
              {tab.label}
            </NavLink>
          ))}
        </nav>
      )}

      {session && (
        <>
          <nav className="mobile-tabbar">
            <div className="mobile-tabbar-group">
              {MOBILE_PRIMARY_TABS.slice(0, 2).map((tab) => (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  end={tab.to === "/"}
                  aria-label={tab.label}
                  className={({ isActive }) => (isActive ? "mobile-tab-icon active" : "mobile-tab-icon")}
                >
                  <tab.Icon size={24} strokeWidth={2} aria-hidden="true" />
                </NavLink>
              ))}
            </div>
            <div className="mobile-tabbar-group">
              {MOBILE_PRIMARY_TABS.slice(2).map((tab) => (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  end={tab.to === "/"}
                  aria-label={tab.label}
                  className={({ isActive }) => (isActive ? "mobile-tab-icon active" : "mobile-tab-icon")}
                >
                  <tab.Icon size={24} strokeWidth={2} aria-hidden="true" />
                </NavLink>
              ))}
              <button
                type="button"
                className="mobile-tab-icon"
                aria-label="More"
                aria-haspopup="true"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen(true)}
              >
                <Menu size={24} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          </nav>

          <Link to="/assistant" className="mobile-fab" aria-label="Ask the Assistant">
            <Sparkles size={26} strokeWidth={2} aria-hidden="true" />
          </Link>

          {moreOpen && (
            <Modal onClose={() => setMoreOpen(false)}>
              <div className="more-menu">
                <h3>More</h3>
                <div className="more-menu-list">
                  {MOBILE_MORE_ITEMS.map((item) => (
                    <Link key={item.to} to={item.to} className="more-menu-item" onClick={() => setMoreOpen(false)}>
                      <item.Icon size={20} strokeWidth={2} aria-hidden="true" />
                      {item.label}
                    </Link>
                  ))}
                </div>
                <button type="button" className="btn-secondary more-menu-close" onClick={() => setMoreOpen(false)}>
                  Close
                </button>
              </div>
            </Modal>
          )}
        </>
      )}
    </div>
  );
}
