import { test } from "node:test";
import assert from "node:assert/strict";
import {
  statusFor,
  daysBetween,
  addDays,
  isValidDateStr,
  todayInTz,
  expiryFilterForStatus,
} from "../utils/dates.js";

const TODAY = "2026-11-02";

test("status around today / tomorrow / yesterday", () => {
  assert.equal(statusFor("2026-11-01", TODAY), "expired"); // yesterday
  assert.equal(statusFor("2026-11-02", TODAY), "red"); // today -> 0 days
  assert.equal(statusFor("2026-11-03", TODAY), "red"); // tomorrow
});

test("status band boundaries", () => {
  assert.equal(statusFor(addDays(TODAY, 7), TODAY), "red"); // last red day
  assert.equal(statusFor(addDays(TODAY, 8), TODAY), "amber"); // first amber
  assert.equal(statusFor(addDays(TODAY, 30), TODAY), "amber"); // last amber
  assert.equal(statusFor(addDays(TODAY, 31), TODAY), "green"); // first green
});

test("day arithmetic crosses months and years", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2027-01-01", -1), "2026-12-31");
  assert.equal(daysBetween("2026-11-02", "2026-12-02"), 30);
  assert.equal(daysBetween("2026-11-02", "2026-11-01"), -1);
});

test("leap-year validation", () => {
  assert.equal(isValidDateStr("2028-02-29"), true); // 2028 is a leap year
  assert.equal(isValidDateStr("2027-02-29"), false);
  assert.equal(isValidDateStr("2026-02-30"), false);
  assert.equal(isValidDateStr("2026-13-01"), false);
  assert.equal(isValidDateStr("02/11/2026"), false); // wrong shape entirely
});

test("todayInTz: extreme timezones straddle at most one calendar day", () => {
  const east = todayInTz("Pacific/Kiritimati"); // UTC+14
  const west = todayInTz("Pacific/Midway"); // UTC-11
  assert.match(east, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(west, /^\d{4}-\d{2}-\d{2}$/);
  const diff = daysBetween(west, east);
  assert.ok(diff === 0 || diff === 1, `east/west differ by ${diff}`);
});

test("todayInTz falls back to UTC on an invalid zone", () => {
  assert.equal(todayInTz("Not/AZone"), todayInTz("UTC"));
});

test("status filters use string ranges that match statusFor", () => {
  // Every date in each filter's range must produce that same status.
  for (const status of ["expired", "red", "amber", "green"]) {
    const f = expiryFilterForStatus(status, TODAY);
    const probe =
      status === "expired" ? addDays(TODAY, -3)
      : status === "red" ? addDays(TODAY, 5)
      : status === "amber" ? addDays(TODAY, 15)
      : addDays(TODAY, 100);
    assert.equal(statusFor(probe, TODAY), status);
    if (f.$lt) assert.ok(probe < f.$lt);
    if (f.$gte) assert.ok(probe >= f.$gte);
    if (f.$lte) assert.ok(probe <= f.$lte);
  }
});
