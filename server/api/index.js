// Vercel serverless entry point. Locally we run index.js (a long-lived
// process with the node-cron schedule); on Vercel each request spins up this
// handler instead. The DB connection is cached across warm invocations.
//
// The 08:00 reminder run has no cron here — an external scheduler
// (e.g. cron-job.org) POSTs /api/internal/run-reminders daily instead.
import mongoose from "mongoose";
import app from "../app.js";

let connecting = null;

export default async function handler(req, res) {
  try {
    if (!connecting) connecting = mongoose.connect(process.env.MONGODB_URI);
    await connecting;
  } catch (err) {
    connecting = null; // let the next request retry instead of caching the failure
    console.error("DB connection failed:", err.message);
    return res.status(500).json({ message: "Database connection failed" });
  }
  return app(req, res);
}
