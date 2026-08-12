import { Routes, Route, NavLink } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ItemsPage from "./pages/ItemsPage";
import CustomersPage from "./pages/CustomersPage";
import BookingsPage from "./pages/BookingsPage";
import ReportsPage from "./pages/ReportsPage";
import ChargesPage from "./pages/ChargesPage";
import AssistantPage from "./pages/AssistantPage";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./lib/auth";
import { supabase } from "./lib/supabase";
import "./styles/shared.css";

const TABS = [
  { to: "/", label: "Dashboard" },
  { to: "/items", label: "Items" },
  { to: "/customers", label: "Customers" },
  { to: "/bookings", label: "Bookings" },
  { to: "/reports", label: "Reports" },
  { to: "/charges", label: "Charges" },
  { to: "/assistant", label: "Assistant" },
];

export default function App() {
  const { session } = useAuth();

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
    </div>
  );
}
