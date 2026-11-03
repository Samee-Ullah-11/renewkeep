import "dotenv/config";
import mongoose from "mongoose";
import cron from "node-cron";
import app from "./app.js";
import { runReminders } from "./jobs/reminders.js";

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    app.listen(PORT, () => console.log(`API listening on :${PORT}`));
    // Daily reminder run at 08:00 server time. Safe alongside the external
    // trigger endpoint: ReminderLog makes duplicate sends impossible.
    cron.schedule("0 8 * * *", () =>
      runReminders().catch((err) => console.error("cron reminders failed:", err))
    );
  })
  .catch((err) => {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  });
