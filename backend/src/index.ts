import "dotenv/config";
import express from "express";
import cors from "cors";
import { itemsRouter } from "./routes/items.js";
import { customersRouter } from "./routes/customers.js";
import { bookingsRouter } from "./routes/bookings.js";
import { paymentsRouter } from "./routes/payments.js";
import { expensesRouter } from "./routes/expenses.js";
import { chatRouter } from "./routes/chat.js";
import { requireAuth, type AuthedRequest } from "./middleware/auth.js";

const app = express();
const port = process.env.PORT ?? 4000;
const allowedOrigins = (process.env.CORS_ORIGIN ?? "").split(",").map((s) => s.trim());

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

// Returns the caller's own app profile (id, role, name, email). Not used to
// gate anything yet — exists so role-based UI (e.g. admin-only reports) is a
// small change later rather than a rewrite. See CLAUDE.md.
app.get("/api/me", requireAuth, (req: AuthedRequest, res) => {
  res.json(req.user);
});

app.use("/api/items", requireAuth, itemsRouter);
app.use("/api/customers", requireAuth, customersRouter);
app.use("/api/bookings", requireAuth, bookingsRouter);
app.use("/api/payments", requireAuth, paymentsRouter);
app.use("/api/expenses", requireAuth, expensesRouter);
app.use("/api/chat", requireAuth, chatRouter);

app.listen(port, () => {
  console.log(`NGJ backend listening on :${port}`);
});
