// Date-only helpers. Expiry dates are "YYYY-MM-DD" strings everywhere in the
// app — never timestamps. The only timezone-aware step is finding "today" in
// the company's timezone; all other math is plain calendar-day arithmetic.

/** Today's date as "YYYY-MM-DD" in the given IANA timezone. */
export function todayInTz(timezone) {
  // en-CA locale formats dates as YYYY-MM-DD.
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  } catch {
    // Unknown/invalid timezone string — fall back to UTC rather than crash.
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(new Date());
  }
}

/** True when s is a real calendar date in "YYYY-MM-DD" form. */
export function isValidDateStr(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) return false;
  const d = new Date(`${s}T00:00:00Z`);
  // Round-trip check catches impossible dates like 2026-02-30.
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Add n calendar days to a "YYYY-MM-DD" string. n may be negative. */
export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whole calendar days from one date string to another (to - from). */
export function daysBetween(fromStr, toStr) {
  return Math.round(
    (Date.parse(`${toStr}T00:00:00Z`) - Date.parse(`${fromStr}T00:00:00Z`)) / 86400000
  );
}

/**
 * Status of an expiry date relative to "today" (both "YYYY-MM-DD"):
 * expired (past), red (0-7 days left), amber (8-30), green (31+).
 */
export function statusFor(expiryDate, today) {
  const days = daysBetween(today, expiryDate);
  if (days < 0) return "expired";
  if (days <= 7) return "red";
  if (days <= 30) return "amber";
  return "green";
}

/**
 * Mongo filter on the expiryDate field matching one status, given "today".
 * Because expiryDate is a zero-padded string, lexicographic comparison is
 * identical to date comparison, so range queries work on the index.
 */
export function expiryFilterForStatus(status, today) {
  switch (status) {
    case "expired":
      return { $lt: today };
    case "red":
      return { $gte: today, $lte: addDays(today, 7) };
    case "amber":
      return { $gte: addDays(today, 8), $lte: addDays(today, 30) };
    case "green":
      return { $gte: addDays(today, 31) };
    default:
      return null;
  }
}
