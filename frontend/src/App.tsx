import { useEffect, useState } from "react";
import { Routes, Route, NavLink, Link } from "react-router-dom";
import { Home, Calendar, Gem, Users, Sparkles, Menu, BarChart3, Wallet, AlertCircle, Settings } from "lucide-react";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ItemsPage from "./pages/ItemsPage";
import CustomersPage from "./pages/CustomersPage";
import BookingsPage from "./pages/BookingsPage";
import ReportsPage from "./pages/ReportsPage";
import ExpensesPage from "./pages/ExpensesPage";
import ChargesPage from "./pages/ChargesPage";
import AssistantPage from "./pages/AssistantPage";
import SettingsPage from "./pages/SettingsPage";
import ReceiptPage from "./pages/ReceiptPage";
import ProtectedRoute from "./components/ProtectedRoute";
import { Modal } from "./components/common/Modal";
import { Avatar } from "./components/common/Avatar";
import { ProfilePanel } from "./components/common/ProfilePanel";
import { useAuth } from "./lib/auth";
import { supabase } from "./lib/supabase";
import "./styles/shared.css";

// Desktop keeps every page directly reachable in one row — no space
// constraint there, so no need to split anything into a "more" bucket.
// Settings is appended conditionally (admin only) inside the component,
// not listed here statically.
const BASE_TABS = [
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
// destinations (icon + small label — icon-only risked an unsure tap for a
// less technical user) — everything else moves to Ask (rendered inline as
// the row's middle item, see below) or the header's "More" sheet. Exactly
// 2 + 2 either side of Ask, no odd item padded in to compensate.
const MOBILE_PRIMARY_TABS = [
  { to: "/", label: "Dashboard", Icon: Home },
  { to: "/bookings", label: "Bookings", Icon: Calendar },
  { to: "/items", label: "Items", Icon: Gem },
  { to: "/customers", label: "Customers", Icon: Users },
];

// Not part of the primary 4 and not frequent enough for a dedicated FAB —
// opened from a header icon rather than the bottom bar, so the bottom bar
// stays an even 2-2 split around the FAB. Charges isn't named in the
// original split (Reports/Expenses) but leaving it unreachable on mobile
// would be a real regression, so it lives here too. Settings is appended
// conditionally (admin only) inside the component.
const BASE_MOBILE_MORE_ITEMS = [
  { to: "/reports", label: "Reports", Icon: BarChart3 },
  { to: "/expenses", label: "Expenses", Icon: Wallet },
  { to: "/charges", label: "Charges", Icon: AlertCircle },
];

export default function App() {
  const { session, profile } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const isAdmin = profile?.role === "admin";
  const TABS = isAdmin ? [...BASE_TABS, { to: "/settings", label: "Settings" }] : BASE_TABS;
  const MOBILE_MORE_ITEMS = isAdmin ? [...BASE_MOBILE_MORE_ITEMS, { to: "/settings", label: "Settings", Icon: Settings }] : BASE_MOBILE_MORE_ITEMS;

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
          <div className="app-header-actions">
            <button
              type="button"
              className="mobile-more-btn"
              aria-label="More"
              aria-haspopup="true"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen(true)}
            >
              <Menu size={22} strokeWidth={2} aria-hidden="true" />
            </button>
            <button type="button" className="avatar-btn" aria-label="Your profile" onClick={() => setProfileOpen(true)}>
              <Avatar name={profile?.name} photoUrl={profile?.photo_url} />
            </button>
            <button className="btn-secondary" onClick={() => supabase.auth.signOut()}>
              Log Out
            </button>
          </div>
        )}
      </header>

      {profileOpen && (
        <Modal onClose={() => setProfileOpen(false)}>
          <ProfilePanel onClose={() => setProfileOpen(false)} />
        </Modal>
      )}

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
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/receipt/:bookingId"
            element={
              <ProtectedRoute>
                <ReceiptPage />
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
            {MOBILE_PRIMARY_TABS.slice(0, 2).map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.to === "/"}
                className={({ isActive }) => (isActive ? "mobile-tab-icon active" : "mobile-tab-icon")}
              >
                <tab.Icon size={22} strokeWidth={2} aria-hidden="true" />
                <span>{tab.label}</span>
              </NavLink>
            ))}

            <NavLink to="/assistant" className={({ isActive }) => (isActive ? "mobile-tab-icon mobile-tab-ask active" : "mobile-tab-icon mobile-tab-ask")}>
              <span className="mobile-tab-ask-badge">
                <Sparkles size={20} strokeWidth={2} aria-hidden="true" />
              </span>
              <span>Ask</span>
            </NavLink>

            {MOBILE_PRIMARY_TABS.slice(2).map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.to === "/"}
                className={({ isActive }) => (isActive ? "mobile-tab-icon active" : "mobile-tab-icon")}
              >
                <tab.Icon size={22} strokeWidth={2} aria-hidden="true" />
                <span>{tab.label}</span>
              </NavLink>
            ))}
          </nav>

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
