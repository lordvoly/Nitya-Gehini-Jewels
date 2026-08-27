import "dotenv/config";
import express, { type ErrorRequestHandler } from "express";
// Patches Express's router so a rejected/thrown error inside an async route
// handler is forwarded to the error-handling middleware below automatically
// — Express 4 doesn't do this on its own, and this app's route handlers are
// almost all async. Must be imported before any router/route is defined.
import "express-async-errors";
import cors from "cors";
import multer from "multer";
import { UnsupportedFileTypeError } from "./lib/errors.js";
import { itemsRouter } from "./routes/items.js";
import { customersRouter } from "./routes/customers.js";
import { bookingsRouter } from "./routes/bookings.js";
import { paymentsRouter } from "./routes/payments.js";
import { itemChargesRouter } from "./routes/itemCharges.js";
import { pendingItemsRouter } from "./routes/pendingItems.js";
import { expensesRouter } from "./routes/expenses.js";
import { chatRouter } from "./routes/chat.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { reportsRouter } from "./routes/reports.js";
import { shopSettingsRouter } from "./routes/shopSettings.js";
import { meRouter } from "./routes/me.js";
import { publicReceiptRouter } from "./routes/publicReceipt.js";
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
app.use("/api/pending-items", requireAuth, pendingItemsRouter);
app.use("/api/expenses", requireAuth, expensesRouter);
app.use("/api/chat", requireAuth, chatRouter);
app.use("/api/dashboard", requireAuth, dashboardRouter);
app.use("/api/reports", requireAuth, reportsRouter);
app.use("/api/shop-settings", requireAuth, shopSettingsRouter);

// Deliberately NOT behind requireAuth — this is the one route a customer
// reaches from a WhatsApp link with no account at all. See
// routes/publicReceipt.ts for the narrow, explicitly whitelisted response
// shape and its own per-route rate limiter.
app.use("/api/public", publicReceiptRouter);

// Global error handler — must be registered last (Express identifies
// error-handling middleware by its 4-argument signature) and after every
// route above. Without this, any error reaching here — multer rejecting a
// file (too large or wrong type), express.json() choking on a malformed
// body, or an unhandled throw in any async route handler (forwarded here
// automatically by express-async-errors, imported above) — fell through to
// Express's own default handler, which renders an HTML error page.
// apiFetch on the frontend can't parse HTML as JSON, so every such failure
// surfaced as the same generic "request failed" message no matter what
// actually broke — this is what turned a real, specific cause (a photo
// over the size limit) into an unhelpful generic one.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "That file is too large — please use a smaller one." });
  }
  if (err instanceof UnsupportedFileTypeError) {
    return res.status(415).json({ error: err.message });
  }
  // express.json()'s own body-parser throws a plain SyntaxError (tagged
  // with a `body` property) on malformed JSON — a real, different error
  // path from either upload case above, used to prove this handler is a
  // genuine catch-all rather than a photo-upload-specific patch.
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ error: "Invalid JSON in request body." });
  }
  console.error(err);
  res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
};
app.use(errorHandler);

app.listen(port, () => {
  console.log(`NGJ backend listening on :${port}`);
});
