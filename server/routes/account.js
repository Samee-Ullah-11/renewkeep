import express from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Company from "../models/Company.js";
import Item from "../models/Item.js";
import ReminderLog from "../models/ReminderLog.js";
import Invite from "../models/Invite.js";
import * as storage from "../utils/storage.js";
import { protect } from "../middleware/auth.js";
import { tenantScope } from "../middleware/tenant.js";

const router = express.Router();
router.use(protect, tenantScope);

// GET /api/account/export — everything we hold about you, as a JSON download.
router.get("/export", async (req, res) => {
  try {
    const items = await Item.find(req.tenantFilter).lean();
    const logs = await ReminderLog.find(req.tenantFilter).lean();
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", 'attachment; filename="renewkeep-export.json"');
    res.send(
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          user: {
            name: req.user.name,
            email: req.user.email,
            role: req.user.role,
            createdAt: req.user.createdAt,
          },
          company: {
            name: req.company.name,
            timezone: req.company.timezone,
            plan: req.company.plan,
            itemLimit: req.company.itemLimit,
            reminderEmails: req.company.reminderEmails,
          },
          items,
          reminderLogs: logs,
        },
        null,
        2
      )
    );
  } catch (err) {
    console.error("export data error:", err);
    res.status(500).json({ message: "Could not export your data" });
  }
});

// DELETE /api/account — body { password }. Deletes the account; the last
// member leaving also deletes the company and all of its data and files.
router.delete("/", async (req, res) => {
  try {
    const { password } = req.body || {};
    const withPassword = await User.findById(req.user._id).select("+password");
    if (!password || !(await bcrypt.compare(String(password), withPassword.password)))
      return res.status(401).json({ message: "Wrong password" });

    const memberCount = await User.countDocuments(req.tenantFilter);
    const adminCount = await User.countDocuments({ ...req.tenantFilter, role: "admin" });

    if (memberCount > 1 && req.user.role === "admin" && adminCount === 1)
      return res.status(400).json({
        message: "Promote another member to admin before deleting your account",
      });

    await User.deleteOne({ _id: req.user._id });

    if (memberCount === 1) {
      // Last one out turns off the lights: items (and their files on disk),
      // logs, invites, then the company itself.
      const items = await Item.find(req.tenantFilter);
      for (const item of items)
        if (item.file?.key) await storage.remove(item.file.key);
      await Item.deleteMany(req.tenantFilter);
      await ReminderLog.deleteMany(req.tenantFilter);
      await Invite.deleteMany(req.tenantFilter);
      await Company.deleteOne({ _id: req.company._id });
    }

    res.clearCookie("token");
    res.json({ message: "Account deleted" });
  } catch (err) {
    console.error("delete account error:", err);
    res.status(500).json({ message: "Could not delete your account" });
  }
});

export default router;
