import { Routes, Route, Link } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ItemsPage from "./pages/ItemsPage";
import CustomersPage from "./pages/CustomersPage";
import BookingsPage from "./pages/BookingsPage";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./lib/auth";
import { supabase } from "./lib/supabase";

export default function App() {
  const { session } = useAuth();

  return (
    <div>
      <nav>
        <Link to="/">Dashboard</Link> | <Link to="/items">Items</Link> |{" "}
        <Link to="/customers">Customers</Link> | <Link to="/bookings">Bookings</Link>
        {session && (
          <>
            {" | "}
            <button onClick={() => supabase.auth.signOut()}>Log out</button>
          </>
        )}
      </nav>
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
      </Routes>
    </div>
  );
}
