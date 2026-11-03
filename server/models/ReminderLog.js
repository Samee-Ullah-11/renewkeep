import mongoose from "mongoose";

const reminderLogSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Item",
      required: true,
    },
    // The expiry date this reminder was for. When an item is renewed its
    // expiryDate changes, so new logs don't collide with old ones and a
    // fresh reminder cycle starts automatically.
    expiryDate: { type: String, required: true },
    // Days until expiry when the reminder fired: 60/30/7/0, or -1/-7/-14
    // for the overdue follow-ups.
    offsetDays: { type: Number, required: true },
    sentAt: { type: Date },
    status: { type: String, enum: ["sent", "failed"], required: true },
    error: { type: String, default: "" },
    // Failed sends are retried on later runs, up to MAX_ATTEMPTS.
    attempts: { type: Number, default: 1 },
  },
  { timestamps: true }
);

// The idempotency guarantee: one reminder per item per expiry per offset,
// enforced by the database itself — a double send is impossible even if two
// runs overlap.
reminderLogSchema.index(
  { itemId: 1, expiryDate: 1, offsetDays: 1 },
  { unique: true }
);

export default mongoose.model("ReminderLog", reminderLogSchema);
