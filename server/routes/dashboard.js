import express from "express";
import Item from "../models/Item.js";
import { toClient } from "./items.js";
import { protect } from "../middleware/auth.js";
import { tenantScope } from "../middleware/tenant.js";
import { todayInTz, expiryFilterForStatus } from "../utils/dates.js";

const router = express.Router();

// GET /api/dashboard — status counts + the 5 soonest-expiring items.
router.get("/", protect, tenantScope, async (req, res) => {
  try {
    const today = todayInTz(req.company.timezone);

    const counts = {};
    for (const status of ["expired", "red", "amber", "green"]) {
      counts[status] = await Item.countDocuments({
        ...req.tenantFilter,
        expiryDate: expiryFilterForStatus(status, today),
      });
    }

    // Soonest list: everything still current (not expired), nearest first.
    const soonest = await Item.find({
      ...req.tenantFilter,
      expiryDate: { $gte: today },
    })
      .sort({ expiryDate: 1 })
      .limit(5);

    res.json({
      counts,
      total: counts.expired + counts.red + counts.amber + counts.green,
      soonest: soonest.map((i) => toClient(i, today)),
      today,
      timezone: req.company.timezone,
      itemLimit: req.company.itemLimit,
    });
  } catch (err) {
    console.error("dashboard error:", err);
    res.status(500).json({ message: "Could not load dashboard" });
  }
});

export default router;
