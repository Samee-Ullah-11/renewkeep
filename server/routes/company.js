import express from "express";
import { protect, requireAdmin } from "../middleware/auth.js";
import { tenantScope } from "../middleware/tenant.js";

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True when tz is a real IANA timezone the runtime knows. */
function isValidTimezone(tz) {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// PUT /api/company — admin-only company settings.
router.put("/", protect, tenantScope, requireAdmin, async (req, res) => {
  try {
    const { name, timezone, reminderEmails } = req.body || {};

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim() || name.trim().length > 120)
        return res.status(400).json({ message: "Company name must be 1–120 characters" });
      req.company.name = name.trim();
    }
    if (timezone !== undefined) {
      if (typeof timezone !== "string" || !isValidTimezone(timezone))
        return res.status(400).json({ message: "Unknown timezone" });
      req.company.timezone = timezone;
    }
    if (reminderEmails !== undefined) {
      if (!Array.isArray(reminderEmails) || reminderEmails.length > 10)
        return res.status(400).json({ message: "reminderEmails must be a list of up to 10 emails" });
      const cleaned = reminderEmails.map((e) => String(e).trim().toLowerCase()).filter(Boolean);
      for (const e of cleaned)
        if (!EMAIL_RE.test(e)) return res.status(400).json({ message: `Invalid email: ${e}` });
      req.company.reminderEmails = [...new Set(cleaned)];
    }

    await req.company.save();
    res.json({
      company: {
        id: req.company._id,
        name: req.company.name,
        timezone: req.company.timezone,
        plan: req.company.plan,
        itemLimit: req.company.itemLimit,
        reminderEmails: req.company.reminderEmails,
      },
    });
  } catch (err) {
    console.error("update company error:", err);
    res.status(500).json({ message: "Could not save settings" });
  }
});

export default router;
