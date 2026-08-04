import { Routes, Route, Link } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ItemsPage from "./pages/ItemsPage";
import CustomersPage from "./pages/CustomersPage";
import BookingsPage from "./pages/BookingsPage";

export default function App() {
  return (
    <div>
      <nav>
        <Link to="/">Dashboard</Link> | <Link to="/items">Items</Link> |{" "}
        <Link to="/customers">Customers</Link> | <Link to="/bookings">Bookings</Link>
      </nav>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<DashboardPage />} />
        <Route path="/items" element={<ItemsPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/bookings" element={<BookingsPage />} />
      </Routes>
    </div>
  );
}
