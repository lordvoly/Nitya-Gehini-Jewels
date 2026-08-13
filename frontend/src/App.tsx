import { useState } from "react";
import { Routes, Route, NavLink, useLocation } from "react-router-dom";
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
import "./styles/admin/style.scss";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: "ti ti-home" },
  { to: "/items", label: "Inventory Items", icon: "ti ti-box-seam" },
  { to: "/customers", label: "Customers", icon: "ti ti-users" },
  { to: "/bookings", label: "Bookings & Rentals", icon: "ti ti-calendar-event" },
  { to: "/reports", label: "Reports & Analytics", icon: "ti ti-receipt" },
  { to: "/charges", label: "Outstanding Charges", icon: "ti ti-currency-rupee" },
  { to: "/assistant", label: "Ask AI Assistant", icon: "ti ti-message-bot" },
];

export default function App() {
  const { session } = useAuth();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileShow, setMobileShow] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);

  const isLoginPage = location.pathname === "/login";

  if (isLoginPage || !session) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="*"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    );
  }

  return (
    <div className="admin-layout">
      {/* Mobile Backdrop Overlay */}
      <div
        className={`overlay ${mobileShow ? "show" : ""}`}
        onClick={() => setMobileShow(false)}
      />

      {/* TOPBAR */}
      <nav
        id="topbar"
        className={`navbar bg-white border-bottom fixed-top topbar px-3 ${
          sidebarCollapsed ? "full" : ""
        }`}
      >
        <div className="d-flex align-items-center gap-2">
          {/* Desktop Collapse Toggle */}
          <button
            type="button"
            className="d-none d-lg-inline-flex btn btn-light btn-icon btn-sm"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title="Toggle Sidebar"
          >
            <i className="ti ti-layout-sidebar-left-expand fs-5"></i>
          </button>

          {/* Mobile Drawer Toggle */}
          <button
            type="button"
            className="btn btn-light btn-icon btn-sm d-lg-none me-2"
            onClick={() => setMobileShow(true)}
            title="Open Menu"
          >
            <i className="ti ti-menu-2 fs-5"></i>
          </button>

        </div>

        <div className="d-flex align-items-center gap-3">
          {/* Notifications Dropdown */}
          <div className="position-relative">
            <button
              type="button"
              className="position-relative btn-icon btn-sm btn-light btn rounded-circle"
              onClick={() => {
                setShowNotifDropdown(!showNotifDropdown);
                setShowUserDropdown(false);
              }}
            >
              <i className="ti ti-bell fs-5"></i>
              <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger mt-1 ms-n1">
                2
              </span>
            </button>

            {showNotifDropdown && (
              <div
                className="dropdown-menu dropdown-menu-end show p-0 shadow-sm border mt-2"
                style={{ width: 280, right: 0 }}
              >
                <div className="p-3 border-bottom bg-light fw-medium small">
                  Notifications
                </div>
                <ul className="list-unstyled p-0 m-0 small">
                  <li className="p-3 border-bottom">
                    <div className="d-flex gap-2 align-items-start">
                      <div className="icon-shape bg-warning-subtle text-warning rounded p-2">
                        <i className="ti ti-clock"></i>
                      </div>
                      <div>
                        <p className="mb-0 fw-medium">Items Due Today</p>
                        <span className="text-muted fs-7">
                          Check daily returns schedule
                        </span>
                      </div>
                    </div>
                  </li>
                  <li className="p-3 border-bottom">
                    <div className="d-flex gap-2 align-items-start">
                      <div className="icon-shape bg-success-subtle text-success rounded p-2">
                        <i className="ti ti-check"></i>
                      </div>
                      <div>
                        <p className="mb-0 fw-medium">System Active</p>
                        <span className="text-muted fs-7">
                          Supabase backend connected
                        </span>
                      </div>
                    </div>
                  </li>
                </ul>
              </div>
            )}
          </div>

          {/* User Profile Dropdown */}
          <div className="position-relative">
            <button
              type="button"
              className="btn p-0 border-0 d-flex align-items-center gap-2"
              onClick={() => {
                setShowUserDropdown(!showUserDropdown);
                setShowNotifDropdown(false);
              }}
            >
              <div className="avatar avatar-sm rounded-circle bg-primary text-white d-flex align-items-center justify-content-center fw-semibold">
                NG
              </div>
              <span className="d-none d-md-inline-block small fw-medium text-dark">
                {session.user.email?.split("@")[0] ?? "Admin"}
              </span>
              <i className="ti ti-chevron-down text-muted fs-7"></i>
            </button>

            {showUserDropdown && (
              <div
                className="dropdown-menu dropdown-menu-end show p-0 shadow-sm border mt-2"
                style={{ minWidth: 200, right: 0 }}
              >
                <div className="px-3 py-3 border-bottom bg-light">
                  <div className="fw-semibold small">{session.user.email}</div>
                  <div className="text-muted fs-7">Administrator</div>
                </div>
                <div className="p-2">
                  <button
                    className="dropdown-item text-danger d-flex align-items-center gap-2 rounded py-2 small"
                    onClick={() => supabase.auth.signOut()}
                  >
                    <i className="ti ti-logout"></i> Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* SIDEBAR */}
      <aside
        id="sidebar"
        className={`sidebar ${sidebarCollapsed ? "collapsed" : ""} ${
          mobileShow ? "mobile-show" : ""
        }`}
      >
        <div className="logo-area">
          <span className="icon-shape bg-primary text-white rounded p-1">
            <i className="ti ti-diamond fs-5"></i>
          </span>
          <span className="logo-text fw-bold fs-6 text-dark ms-1">
            NG Jewels
          </span>
        </div>

        <ul className="nav flex-column mt-3">
          <li className="px-4 py-2">
            <small className="text-uppercase text-muted fw-semibold fs-7 nav-text">
              Main Menu
            </small>
          </li>
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  isActive ? "nav-link active" : "nav-link"
                }
                onClick={() => setMobileShow(false)}
              >
                <i className={item.icon}></i>
                <span className="nav-text">{item.label}</span>
              </NavLink>
            </li>
          ))}

          <li className="px-4 pt-4 pb-2">
            <small className="text-uppercase text-muted fw-semibold fs-7 nav-text">
              Account
            </small>
          </li>
          <li>
            <button
              className="nav-link text-danger border-0 bg-transparent w-100 text-start"
              onClick={() => supabase.auth.signOut()}
            >
              <i className="ti ti-logout"></i>
              <span className="nav-text">Log out</span>
            </button>
          </li>
        </ul>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main
        id="content"
        className={`content py-4 px-3 px-md-4 ${
          sidebarCollapsed ? "full" : ""
        }`}
        style={{ marginTop: 60, minHeight: "calc(100vh - 60px)" }}
      >
        <Routes>
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
    </div>
  );
}
