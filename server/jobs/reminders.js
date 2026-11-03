// Reminder engine. Designed to be safe to run any number of times a day:
// the ReminderLog unique index {itemId, expiryDate, offsetDays} makes every
// reminder exactly-once per expiry cycle, and renewing an item (new
// expiryDate) automatically starts a fresh cycle.
import Company from "../models/Company.js";
import User from "../models/User.js";
import Item from "../models/Item.js";
import ReminderLog from "../models/ReminderLog.js";
import sendEmail from "../utils/sendEmail.js";
import { todayInTz, addDays, daysBetween } from "../utils/dates.js";

// Days-until-expiry values that trigger a reminder. Negative = days after
// expiry (overdue follow-ups at 1, 7 and 14 days, then we stop nagging).
export const OFFSETS = [60, 30, 7, 0, -1, -7, -14];
const MAX_ATTEMPTS = 3;

/**
 * Run one reminder pass over every company.
 * @param {{ dryRun?: boolean }} opts dryRun logs what WOULD be sent, sends
 *   nothing and writes no ReminderLog rows.
 * @returns summary object (also useful as the HTTP response of the
 *   internal trigger endpoint).
 */
export async function runReminders({ dryRun = false } = {}) {
  const summary = {
    dryRun,
    companies: 0,
    itemsDue: 0,
    emailsSent: 0,
    emailsFailed: 0,
    skippedAlreadySent: 0,
    details: [],
  };

  const companies = await Company.find();
  for (const company of companies) {
    summary.companies += 1;
    const today = todayInTz(company.timezone);

    // Each offset maps to exactly one expiry date string, so one indexed
    // $in query finds every candidate item for this company.
    const targetDates = OFFSETS.map((o) => addDays(today, o));
    const candidates = await Item.find({
      companyId: company._id,
      expiryDate: { $in: targetDates },
    });
    if (candidates.length === 0) continue;

    // Filter out reminders already sent (or permanently failed) this cycle.
    const due = [];
    for (const item of candidates) {
      const offsetDays = daysBetween(today, item.expiryDate);
      const existing = await ReminderLog.findOne({
        itemId: item._id,
        expiryDate: item.expiryDate,
        offsetDays,
      });
      if (existing && (existing.status === "sent" || existing.attempts >= MAX_ATTEMPTS)) {
        summary.skippedAlreadySent += 1;
        continue;
      }
      due.push({ item, offsetDays, existing });
    }
    if (due.length === 0) continue;
    summary.itemsDue += due.length;

    // ONE digest per company. Recipients: the union of every due item's
    // notifyEmails; items with none fall back to the company's configured
    // reminderEmails (Settings page), and failing that to the admins.
    const recipients = new Set();
    let needFallback = false;
    for (const { item } of due) {
      if (item.notifyEmails.length) item.notifyEmails.forEach((e) => recipients.add(e));
      else needFallback = true;
    }
    if (needFallback || recipients.size === 0) {
      if (company.reminderEmails?.length) {
        company.reminderEmails.forEach((e) => recipients.add(e));
      } else {
        const admins = await User.find({ companyId: company._id, role: "admin" });
        admins.forEach((a) => recipients.add(a.email));
      }
    }
    const to = [...recipients];

    const lines = due.map(({ item, offsetDays }) => ({
      title: item.title,
      type: item.type,
      expiryDate: item.expiryDate,
      when:
        offsetDays > 0
          ? `expires in ${offsetDays} day${offsetDays === 1 ? "" : "s"}`
          : offsetDays === 0
            ? "expires TODAY"
            : `expired ${-offsetDays} day${offsetDays === -1 ? "" : "s"} ago`,
    }));

    summary.details.push({ company: company.name, to, items: lines });

    if (dryRun) {
      console.log(`[reminders dry-run] ${company.name} -> ${to.join(", ")}`);
      lines.forEach((l) => console.log(`  - ${l.title} (${l.when})`));
      continue;
    }

    const html = `
      <h2 style="font-family:sans-serif">RenewKeep — ${lines.length} item${lines.length === 1 ? "" : "s"} need attention</h2>
      <table border="0" cellpadding="6" style="font-family:sans-serif;border-collapse:collapse">
        <tr><th align="left">Item</th><th align="left">Type</th><th align="left">Expiry</th><th align="left">Status</th></tr>
        ${lines
          .map(
            (l) =>
              `<tr><td><strong>${l.title}</strong></td><td>${l.type}</td><td>${l.expiryDate}</td><td>${l.when}</td></tr>`
          )
          .join("")}
      </table>
      <p style="font-family:sans-serif;color:#555">Company: ${company.name} · Sent by RenewKeep</p>`;

    let sendError = null;
    try {
      await sendEmail({
        to,
        subject: `RenewKeep: ${lines.length} item${lines.length === 1 ? "" : "s"} expiring for ${company.name}`,
        html,
      });
      summary.emailsSent += 1;
    } catch (err) {
      sendError = String(err.message || err).slice(0, 500);
      summary.emailsFailed += 1;
      console.error(`[reminders] send failed for ${company.name}:`, sendError);
    }

    // Log every item in the digest. Upsert handles the retry path: a prior
    // "failed" row is updated in place (attempts += 1); the unique index
    // stops duplicates even across concurrent runs.
    for (const { item, offsetDays, existing } of due) {
      try {
        const fields = {
          companyId: company._id,
          status: sendError ? "failed" : "sent",
          error: sendError || "",
          ...(sendError ? {} : { sentAt: new Date() }),
        };
        if (existing) {
          // Retry of a previously failed send: bump the attempt counter.
          await ReminderLog.updateOne(
            { _id: existing._id },
            { $set: fields, $inc: { attempts: 1 } }
          );
        } else {
          await ReminderLog.create({
            itemId: item._id,
            expiryDate: item.expiryDate,
            offsetDays,
            attempts: 1,
            ...fields,
          });
        }
      } catch (err) {
        // Duplicate-key here means a concurrent run logged it first — fine.
        if (err.code !== 11000) console.error("[reminders] log write failed:", err);
      }
    }
  }

  console.log(
    `[reminders] done${dryRun ? " (dry-run)" : ""}: ${summary.itemsDue} due, ` +
      `${summary.emailsSent} sent, ${summary.emailsFailed} failed, ` +
      `${summary.skippedAlreadySent} already handled`
  );
  return summary;
}
