// Integration tests: real express app + a dedicated test database
// (renewkeep_test on the same cluster). EMAIL_DRIVER=test captures emails in
// an in-memory outbox instead of sending them.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import "dotenv/config";

process.env.EMAIL_DRIVER = "test";

const mongoose = (await import("mongoose")).default;
const bcrypt = (await import("bcryptjs")).default;
const app = (await import("../app.js")).default;
const User = (await import("../models/User.js")).default;
const Company = (await import("../models/Company.js")).default;
const Item = (await import("../models/Item.js")).default;
const ReminderLog = (await import("../models/ReminderLog.js")).default;
const { runReminders } = await import("../jobs/reminders.js");
const { outbox } = await import("../utils/sendEmail.js");
const { todayInTz, addDays } = await import("../utils/dates.js");

// Same cluster, separate database: never touches real data.
const TEST_URI = process.env.MONGODB_URI.replace(/\/renewkeep(\?|$)/, "/renewkeep_test$1");

let server;
let base;
const cookies = {}; // email -> Cookie header

async function createUser(email, companyName, role = "admin") {
  const company = await Company.create({ name: companyName, timezone: "UTC" });
  await User.create({
    name: email.split("@")[0],
    email,
    password: await bcrypt.hash("password123", 10),
    isVerified: true,
    companyId: company._id,
    role,
  });
  return company;
}

async function login(email) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123" }),
  });
  assert.equal(res.status, 200);
  cookies[email] = res.headers.get("set-cookie").split(";")[0];
}

const api = (email, path, opts = {}) =>
  fetch(`${base}/api${path}`, {
    ...opts,
    headers: { Cookie: cookies[email], ...(opts.headers || {}) },
  });

const json = (email, path, method, body) =>
  api(email, path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

let companyA;

before(async () => {
  assert.notEqual(TEST_URI, process.env.MONGODB_URI, "test DB must differ from the real one");
  await mongoose.connect(TEST_URI);
  await mongoose.connection.dropDatabase();

  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;

  companyA = await createUser("a@test.local", "Company A");
  await createUser("b@test.local", "Company B");
  await login("a@test.local");
  await login("b@test.local");
});

after(async () => {
  server?.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

/* ------------------------------ tenant isolation ------------------------------ */

test("tenant isolation: company B gets 404 for company A's item and file", async () => {
  // A creates an item and attaches a file.
  const created = await json("a@test.local", "/items", "POST", {
    type: "license",
    title: "A-only license",
    expiryDate: addDays(todayInTz("UTC"), 100),
  });
  assert.equal(created.status, 201);
  const { item } = await created.json();

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const fd = new FormData();
  fd.append("file", new Blob([png], { type: "image/png" }), "doc.png");
  const up = await api("a@test.local", `/items/${item.id}/file`, { method: "POST", body: fd });
  assert.equal(up.status, 201);

  // A can read both; B gets 404 on every route, never 403 (no id probing).
  assert.equal((await api("a@test.local", `/items/${item.id}`)).status, 200);
  assert.equal((await api("a@test.local", `/items/${item.id}/file`)).status, 200);
  assert.equal((await api("b@test.local", `/items/${item.id}`)).status, 404);
  assert.equal((await api("b@test.local", `/items/${item.id}/file`)).status, 404);
  assert.equal((await api("b@test.local", `/items/${item.id}`, { method: "DELETE" })).status, 404);
  assert.equal(
    (await json("b@test.local", `/items/${item.id}`, "PUT", { title: "stolen" })).status,
    404
  );
});

/* ------------------------- reminders: idempotency & renewal ------------------------- */

test("reminder idempotency: two runs, one email, one log row", async () => {
  const today = todayInTz("UTC");
  const item = await Item.create({
    companyId: companyA._id,
    type: "permit",
    title: "Reminder target",
    expiryDate: addDays(today, 7),
  });

  outbox.length = 0;
  await runReminders();
  await runReminders();

  const mine = outbox.filter((m) => m.html.includes("Reminder target"));
  assert.equal(mine.length, 1, "exactly one digest for the item");
  // Falls back to company admins since the item has no notifyEmails.
  assert.ok(mine[0].to.includes("a@test.local"));
  assert.equal(
    await ReminderLog.countDocuments({ itemId: item._id, expiryDate: item.expiryDate }),
    1
  );
});

test("renewal starts a fresh reminder cycle", async () => {
  const today = todayInTz("UTC");
  const item = await Item.findOne({ title: "Reminder target" });

  // Renew through the API, landing on another reminder offset (30 days).
  const renewed = await json("a@test.local", `/items/${item.id}/renew`, "POST", {
    expiryDate: addDays(today, 30),
  });
  assert.equal(renewed.status, 200);

  outbox.length = 0;
  await runReminders();
  const mine = outbox.filter((m) => m.html.includes("Reminder target"));
  assert.equal(mine.length, 1, "renewed item is reminded again for the new date");

  await runReminders();
  assert.equal(
    outbox.filter((m) => m.html.includes("Reminder target")).length,
    1,
    "new cycle is idempotent too"
  );
  // Two cycles -> two log rows (old expiry and new expiry).
  assert.equal(await ReminderLog.countDocuments({ itemId: item._id }), 2);
});

/* ------------------------------ CSV duplicate handling ------------------------------ */

test("importing the same CSV twice creates no duplicates", async () => {
  const csv = [
    "type,title,holderName,issuer,number,expiryDate,notes,notifyEmails",
    "license,CSV One,Holder,Issuer,N-1,2027-05-01,,",
    "permit,CSV Two,,,N-2,01/06/2027,,", // DD/MM date normalised on import
  ].join("\n");

  const first = await json("a@test.local", "/items/import", "POST", { csv });
  assert.deepEqual(await first.json(), { created: 2, skippedDuplicates: 0, skippedInvalid: 0 });

  const second = await json("a@test.local", "/items/import", "POST", { csv });
  assert.deepEqual(await second.json(), { created: 0, skippedDuplicates: 2, skippedInvalid: 0 });

  assert.equal(await Item.countDocuments({ companyId: companyA._id, title: "CSV One" }), 1);
  // The normalised date is what got stored.
  const two = await Item.findOne({ companyId: companyA._id, title: "CSV Two" });
  assert.equal(two.expiryDate, "2027-06-01");
});
