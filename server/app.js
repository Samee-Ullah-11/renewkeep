// The express app, separated from index.js so tests can mount it on an
// ephemeral port without connecting the real listener or the cron job.
import express from "express";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.js";
import itemRoutes from "./routes/items.js";
import csvRoutes from "./routes/csv.js";
import dashboardRoutes from "./routes/dashboard.js";
import internalRoutes from "./routes/internal.js";
import teamRoutes from "./routes/team.js";
import companyRoutes from "./routes/company.js";
import accountRoutes from "./routes/account.js";

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.use("/api/auth", authRoutes);
// csvRoutes first: its fixed paths (export.csv, import/…) must win over
// the /:id route in itemRoutes.
app.use("/api/items", csvRoutes);
app.use("/api/items", itemRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/internal", internalRoutes);
app.use("/api/team", teamRoutes);
app.use("/api/company", companyRoutes);
app.use("/api/account", accountRoutes);

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Central error fallback — every route already returns { message } itself.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Something went wrong" });
});

export default app;
