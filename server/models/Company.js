import mongoose from "mongoose";

const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    // IANA timezone string, e.g. "Europe/London". Used to compute item status
    // and reminder days at request/run time; dates themselves stay date-only.
    timezone: { type: String, default: "UTC" },
    plan: { type: String, enum: ["free"], default: "free" },
    itemLimit: { type: Number, default: 25 },
    // Default reminder recipients for items with no notifyEmails of their
    // own. When this is empty too, reminders fall back to the admins.
    reminderEmails: { type: [String], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model("Company", companySchema);
