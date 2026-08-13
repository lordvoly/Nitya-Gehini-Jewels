import "dotenv/config";
import express from "express";
import cors from "cors";
import { itemsRouter } from "./routes/items.js";
import { customersRouter } from "./routes/customers.js";
import { bookingsRouter } from "./routes/bookings.js";
import { paymentsRouter } from "./routes/payments.js";
import { itemChargesRouter } from "./routes/itemCharges.js";
import { expensesRouter } from "./routes/expenses.js";
import { chatRouter } from "./routes/chat.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { reportsRouter } from "./routes/reports.js";
import { shopSettingsRouter } from "./routes/shopSettings.js";
import { meRouter } from "./routes/me.js";
import { requireAuth } from "./middleware/auth.js";

const app = express();
const port = process.env.PORT ?? 4000;

// Comma-separated list of origins allowed to call this API — the Vercel
// frontend URL(s) in production, http://localhost:5173 for local dev.
// filter(Boolean) so an unset/empty CORS_ORIGIN doesn't produce a stray ""
// entry that cors() would otherwise treat as a literal allowed origin.
const allowedOrigins = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

// /api/me — the caller's own app profile, and the self-service profile
// panel's edit/photo-upload endpoints. See routes/me.ts.
app.use("/api/me", requireAuth, meRouter);

app.use("/api/items", requireAuth, itemsRouter);
app.use("/api/customers", requireAuth, customersRouter);
app.use("/api/bookings", requireAuth, bookingsRouter);
app.use("/api/payments", requireAuth, paymentsRouter);
app.use("/api/item-charges", requireAuth, itemChargesRouter);
app.use("/api/expenses", requireAuth, expensesRouter);
app.use("/api/chat", requireAuth, chatRouter);
app.use("/api/dashboard", requireAuth, dashboardRouter);
app.use("/api/reports", requireAuth, reportsRouter);
app.use("/api/shop-settings", requireAuth, shopSettingsRouter);

app.listen(port, () => {
  console.log(`NGJ backend listening on :${port}`);
});
