import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./lib/auth";
import { initTheme } from "./lib/theme";

// index.html's own inline script already set data-theme before first paint
// (avoiding a flash of the wrong theme); this picks up from there — see
// initTheme's own comment for why it's still needed after that.
initTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
