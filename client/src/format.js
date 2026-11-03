// Display helpers. Dates are stored and sent as "YYYY-MM-DD" everywhere;
// these only change how they LOOK on screen.

/** "2026-11-05" -> "5 Nov 2026". Anything unexpected is shown as-is. */
export function formatDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Friendly phrasing for how far away an expiry is: "in 3 days", "today"… */
export function formatDaysLeft(daysLeft) {
  if (daysLeft === 0) return "today";
  if (daysLeft === 1) return "tomorrow";
  if (daysLeft === -1) return "yesterday";
  if (daysLeft > 0) return `in ${daysLeft} days`;
  return `${-daysLeft} days ago`;
}
