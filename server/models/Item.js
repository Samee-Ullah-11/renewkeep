import mongoose from "mongoose";

export const ITEM_TYPES = [
  "license",
  "permit",
  "insurance",
  "employee_doc",
  "other",
];

const itemSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    type: { type: String, enum: ITEM_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    holderName: { type: String, trim: true, maxlength: 120, default: "" },
    issuer: { type: String, trim: true, maxlength: 120, default: "" },
    number: { type: String, trim: true, maxlength: 80, default: "" },
    // Date-only string "YYYY-MM-DD". Status is computed from it at request
    // time in the company's timezone — never stored.
    expiryDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    notes: { type: String, trim: true, maxlength: 2000, default: "" },
    // Reminder recipients; when empty, reminders go to the company admins.
    notifyEmails: { type: [String], default: [] },
    file: {
      type: new mongoose.Schema(
        {
          key: String, // storage key (random filename on disk)
          originalName: String,
          mimeType: String,
          size: Number,
        },
        { _id: false }
      ),
      default: null,
    },
    renewedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// Every list/dashboard/reminder query filters by company and sorts or ranges
// on expiryDate, so this compound index covers them.
itemSchema.index({ companyId: 1, expiryDate: 1 });

export default mongoose.model("Item", itemSchema);
