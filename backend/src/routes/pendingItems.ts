import { Router } from "express";
import { getPendingItems } from "../lib/pendingItemsData.js";

export const pendingItemsRouter = Router();

// GET /api/pending-items — the universal view across every booking: every
// checklist entry flagged missing at return time that was never formally
// charged for. Mirrors GET /api/item-charges's shape/purpose exactly, just
// for the earlier, purely physical-custody stage that never became money —
// see backend/src/lib/pendingItemsData.ts for the exact distinction from
// that route.
pendingItemsRouter.get("/", async (_req, res) => {
  try {
    res.json(await getPendingItems());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});
