// One-off migration: give every user that predates multi-tenancy a Company
// and make them its admin. Safe to run more than once (skips migrated users).
// Run with:  npm run migrate:companies   (from the server/ folder)
import "dotenv/config";
import mongoose from "mongoose";
import User from "../models/User.js";
import Company from "../models/Company.js";

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  // companyId is required on the schema now, so query raw to find legacy rows.
  const legacyUsers = await User.collection
    .find({ companyId: { $exists: false } })
    .toArray();

  console.log(`Found ${legacyUsers.length} user(s) without a company.`);

  for (const u of legacyUsers) {
    const company = await Company.create({ name: `${u.name}'s company` });
    await User.collection.updateOne(
      { _id: u._id },
      { $set: { companyId: company._id, role: "admin" } }
    );
    console.log(`  ${u.email} -> company "${company.name}" (${company._id})`);
  }

  console.log("Migration complete.");
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
