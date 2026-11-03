import express from "express";
import { runReminders } from "../jobs/reminders.js";

const router = express.Router();

// POST /api/internal/run-reminders — lets an external scheduler (e.g. a free
// cron service) trigger the daily run. Protected by a shared secret header,
// NOT by user auth. Add ?dryRun=1 to preview without sending.
router.post("/run-reminders", async (req, res) => {
  const secret = process.env.INTERNAL_SECRET;
  // Refuse entirely when the secret isn't configured — never run open.
  if (!secret || req.get("x-internal-secret") !== secret)
    return res.status(401).json({ message: "Unauthorized" });

  try {
    const summary = await runReminders({ dryRun: req.query.dryRun === "1" });
    res.json(summary);
  } catch (err) {
    console.error("run-reminders error:", err);
    res.status(500).json({ message: "Reminder run failed" });
  }
});

export default router;
