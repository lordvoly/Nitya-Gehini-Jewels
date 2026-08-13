import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { istToday, istMonthRange } from "../lib/dates.js";
import type { AuthedRequest } from "../middleware/auth.js";

export const expensesRouter = Router();

const EXPENSE_CATEGORIES = ["rent", "utilities", "salaries", "stock_purchase", "marketing", "misc", "other"];

// GET /api/expenses?from=YYYY-MM-DD&to=YYYY-MM-DD — defaults to the current IST
// calendar month when omitted, same resolved-range-echoed-back pattern as
// GET /api/reports, so the frontend never computes "this month" itself.
expensesRouter.get("/", async (req, res) => {
  const defaultRange = istMonthRange();
  const from = typeof req.query.from === "string" && req.query.from ? req.query.from : defaultRange.from;
  const to = typeof req.query.to === "string" && req.query.to ? req.query.to : defaultRange.to;

  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });

  res.json({ period: { from, to }, expenses: data });
});

// POST /api/expenses — date defaults to today in IST when omitted, same
// left-blank-on-purpose pattern as payments.ts's payment_date.
expensesRouter.post("/", async (req: AuthedRequest, res) => {
  const { date, category, amount, description } = req.body ?? {};
  if (!category || amount == null) {
    return res.status(400).json({ error: "category and amount are required" });
  }
  if (!EXPENSE_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `category must be one of: ${EXPENSE_CATEGORIES.join(", ")}` });
  }
  if (amount <= 0) {
    return res.status(400).json({ error: "amount must be greater than 0" });
  }
  const { data, error } = await supabase
    .from("expenses")
    .insert({
      date: date || istToday(),
      category,
      amount,
      description: description?.trim() || null,
      recorded_by: req.user?.id ?? null,
    })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});
