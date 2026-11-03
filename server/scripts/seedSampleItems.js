// Creates sample items for testing the reminder engine. The items land on
// exactly the reminder offsets (60/30/7/0/-1/-7/-14 days) plus two that
// should NOT trigger, so one run of the engine exercises every path.
//
// Usage (from server/):
//   node scripts/seedSampleItems.js                      -> demo@renewkeep.test's company
//   node scripts/seedSampleItems.js someone@example.com  -> that user's company
//   node scripts/seedSampleItems.js someone@example.com notify@me.com
//     -> also sets notifyEmails on half the items to notify@me.com
import "dotenv/config";
import mongoose from "mongoose";
import User from "../models/User.js";
import Company from "../models/Company.js";
import Item from "../models/Item.js";
import { todayInTz, addDays } from "../utils/dates.js";

const ownerEmail = process.argv[2] || "demo@renewkeep.test";
const notifyEmail = process.argv[3] || "";

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  const user = await User.findOne({ email: ownerEmail.toLowerCase() });
  if (!user) {
    console.error(`No user with email ${ownerEmail}`);
    process.exit(1);
  }
  const company = await Company.findById(user.companyId);
  const today = todayInTz(company.timezone);

  const rows = [
    // [daysUntilExpiry, type, title, shouldTrigger]
    [60, "insurance", "Sample: liability insurance (60d)", true],
    [30, "license", "Sample: trade license (30d)", true],
    [7, "permit", "Sample: signage permit (7d)", true],
    [0, "employee_doc", "Sample: work visa (expires today)", true],
    [-1, "license", "Sample: import license (1d overdue)", true],
    [-7, "insurance", "Sample: fleet insurance (7d overdue)", true],
    [-14, "permit", "Sample: fire permit (14d overdue)", true],
    [45, "other", "Sample: domain (45d - no reminder)", false],
    [-30, "other", "Sample: old contract (30d overdue - past follow-ups)", false],
  ];

  for (const [offset, type, title, triggers] of rows) {
    const expiryDate = addDays(today, offset);
    // Re-runnable: same title + expiry just updates instead of duplicating.
    await Item.findOneAndUpdate(
      { companyId: company._id, title, expiryDate },
      {
        companyId: company._id,
        type,
        title,
        expiryDate,
        holderName: "Sample data",
        notifyEmails: notifyEmail && triggers ? [notifyEmail] : [],
        createdBy: user._id,
      },
      { upsert: true }
    );
    console.log(`${triggers ? "WILL remind" : "no reminder"}  ${expiryDate}  ${title}`);
  }

  console.log(`\nSeeded for company "${company.name}" (today there: ${today}).`);
  console.log("Run the engine:  curl -X POST -H \"x-internal-secret: $INTERNAL_SECRET\" \"http://localhost:5000/api/internal/run-reminders?dryRun=1\"");
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
