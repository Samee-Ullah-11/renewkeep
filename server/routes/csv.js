import express from "express";
import ExcelJS from "exceljs";
import Item, { ITEM_TYPES } from "../models/Item.js";
import { protect } from "../middleware/auth.js";
import { tenantScope } from "../middleware/tenant.js";
import { parseCsv, toCsv } from "../utils/csv.js";
import { isValidDateStr } from "../utils/dates.js";

// Mounted at /api/items BEFORE the main items router, so these fixed paths
// win over the /:id parameter route.
const router = express.Router();
router.use(protect, tenantScope);

const COLUMNS = [
  "type",
  "title",
  "holderName",
  "issuer",
  "number",
  "expiryDate",
  "notes",
  "notifyEmails", // separated by ; inside the cell
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Accept "YYYY-MM-DD" or "DD/MM/YYYY" (also D/M/YYYY); return normalised
 *  "YYYY-MM-DD", or null when the value is not a real date. Exported for tests. */
export function normalizeDate(raw) {
  const s = String(raw || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return isValidDateStr(s) ? s : null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return isValidDateStr(iso) ? iso : null;
  }
  return null;
}

/** The duplicate identity: title + holderName + number + expiryDate. */
function dupKey(d) {
  return [d.title, d.holderName || "", d.number || "", d.expiryDate]
    .map((v) => String(v).trim().toLowerCase())
    .join("|");
}

/**
 * Parse + validate a CSV against this company. One shared function so the
 * preview and the actual import can never disagree.
 * Returns { header: boolean, rows: [{ line, data, errors[] }] }.
 */
async function analyzeCsv(text, req) {
  const grid = parseCsv(String(text || ""));
  if (grid.length === 0) return { rows: [], error: "The file is empty" };

  // Header row: map column names (case-insensitive) to indices.
  const header = grid[0].map((h) => h.trim());
  const idx = {};
  for (const col of COLUMNS) {
    const i = header.findIndex((h) => h.toLowerCase() === col.toLowerCase());
    if (i !== -1) idx[col] = i;
  }
  if (idx.title === undefined || idx.expiryDate === undefined)
    return { rows: [], error: 'The header row must include "title" and "expiryDate" columns' };

  // Existing items' duplicate keys, for the whole tenant, in one query.
  const existing = await Item.find(req.tenantFilter).select(
    "title holderName number expiryDate"
  );
  const seen = new Set(existing.map(dupKey));

  const existingCount = existing.length;
  let accepted = 0; // valid, non-duplicate rows so far — for the plan limit
  const rows = [];

  for (let r = 1; r < grid.length; r++) {
    const cell = (col) => (idx[col] !== undefined ? String(grid[r][idx[col]] ?? "").trim() : "");
    const errors = [];

    const title = cell("title");
    if (!title) errors.push("Missing title");
    else if (title.length > 160) errors.push("Title longer than 160 characters");

    const expiryDate = normalizeDate(cell("expiryDate"));
    if (!expiryDate)
      errors.push(`Bad date "${cell("expiryDate")}" (use YYYY-MM-DD or DD/MM/YYYY)`);

    let type = cell("type").toLowerCase() || "other";
    if (!ITEM_TYPES.includes(type))
      errors.push(`Unknown type "${cell("type")}" (${ITEM_TYPES.join(", ")})`);

    const notifyEmails = cell("notifyEmails")
      ? cell("notifyEmails").split(/[;|]/).map((e) => e.trim().toLowerCase()).filter(Boolean)
      : [];
    for (const e of notifyEmails)
      if (!EMAIL_RE.test(e)) errors.push(`Invalid notification email "${e}"`);
    if (notifyEmails.length > 10) errors.push("More than 10 notification emails");

    for (const [col, max] of [["holderName", 120], ["issuer", 120], ["number", 80], ["notes", 2000]])
      if (cell(col).length > max) errors.push(`${col} longer than ${max} characters`);

    const data = {
      type,
      title,
      holderName: cell("holderName"),
      issuer: cell("issuer"),
      number: cell("number"),
      expiryDate: expiryDate || cell("expiryDate"),
      notes: cell("notes"),
      notifyEmails: [...new Set(notifyEmails)],
    };

    let duplicate = false;
    if (errors.length === 0) {
      // Covers both an item already in the database and the same row twice
      // in one file — `seen` grows as rows are accepted.
      if (seen.has(dupKey(data))) duplicate = true;
      else if (existingCount + accepted >= req.company.itemLimit)
        errors.push(`Over the plan limit (${req.company.itemLimit} items)`);
      else {
        seen.add(dupKey(data));
        accepted += 1;
      }
    }

    rows.push({ line: r + 1, data, errors, duplicate });
  }

  return { rows };
}

// GET /api/items/export.csv — every item in the company.
router.get("/export.csv", async (req, res) => {
  try {
    const items = await Item.find(req.tenantFilter).sort({ expiryDate: 1 });
    const rows = [
      COLUMNS,
      ...items.map((i) => [
        i.type,
        i.title,
        i.holderName,
        i.issuer,
        i.number,
        i.expiryDate,
        i.notes,
        i.notifyEmails.join(";"),
      ]),
    ];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="renewkeep-items.csv"');
    res.send(toCsv(rows));
  } catch (err) {
    console.error("export csv error:", err);
    res.status(500).json({ message: "Could not export items" });
  }
});

// GET /api/items/export.xlsx — the same data as a formatted Excel file:
// bold UPPERCASE centered headers and readable column widths, which a plain
// CSV cannot carry.
router.get("/export.xlsx", async (req, res) => {
  try {
    const items = await Item.find(req.tenantFilter).sort({ expiryDate: 1 });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Items");

    const WIDTHS = {
      type: 14,
      title: 30,
      holderName: 20,
      issuer: 20,
      number: 16,
      expiryDate: 14,
      notes: 40,
      notifyEmails: 32,
    };
    ws.columns = COLUMNS.map((c) => ({
      header: c.toUpperCase(),
      key: c,
      width: WIDTHS[c],
    }));

    // Keep dates as literal "YYYY-MM-DD" text so Excel never reformats them
    // into a locale-dependent order that the CSV import would misread.
    ws.getColumn("expiryDate").numFmt = "@";

    for (const i of items) {
      ws.addRow({
        type: i.type,
        title: i.title,
        holderName: i.holderName,
        issuer: i.issuer,
        number: i.number,
        expiryDate: i.expiryDate,
        notes: i.notes,
        notifyEmails: i.notifyEmails.join(";"),
      });
    }

    const head = ws.getRow(1);
    head.font = { bold: true };
    head.alignment = { horizontal: "center", vertical: "middle" };
    head.height = 20;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", 'attachment; filename="renewkeep-items.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("export xlsx error:", err);
    res.status(500).json({ message: "Could not export items" });
  }
});

// GET /api/items/import/template — a header row plus one example.
router.get("/import/template", (req, res) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="renewkeep-template.csv"');
  res.send(
    toCsv([
      COLUMNS,
      ["license", "Trade license", "Acme Ltd", "City Council", "TL-1234", "2027-03-31", "Renew at the city office", "ops@example.com;admin@example.com"],
    ])
  );
});

// POST /api/items/import/preview — body { csv } → per-row verdicts, no writes.
router.post("/import/preview", async (req, res) => {
  try {
    if (typeof req.body?.csv !== "string")
      return res.status(400).json({ message: "Send the file content as { csv }" });
    const { rows, error } = await analyzeCsv(req.body.csv, req);
    if (error) return res.status(400).json({ message: error });
    res.json({
      rows,
      summary: {
        total: rows.length,
        valid: rows.filter((r) => r.errors.length === 0 && !r.duplicate).length,
        duplicates: rows.filter((r) => r.duplicate).length,
        invalid: rows.filter((r) => r.errors.length > 0).length,
      },
    });
  } catch (err) {
    console.error("preview csv error:", err);
    res.status(500).json({ message: "Could not read the file" });
  }
});

// POST /api/items/import — re-validates (never trusts the preview) and
// inserts the valid, non-duplicate rows.
router.post("/import", async (req, res) => {
  try {
    if (typeof req.body?.csv !== "string")
      return res.status(400).json({ message: "Send the file content as { csv }" });
    const { rows, error } = await analyzeCsv(req.body.csv, req);
    if (error) return res.status(400).json({ message: error });

    const toInsert = rows.filter((r) => r.errors.length === 0 && !r.duplicate);
    if (toInsert.length) {
      await Item.insertMany(
        toInsert.map((r) => ({
          ...r.data,
          companyId: req.company._id,
          createdBy: req.user._id,
        }))
      );
    }
    res.json({
      created: toInsert.length,
      skippedDuplicates: rows.filter((r) => r.duplicate).length,
      skippedInvalid: rows.filter((r) => r.errors.length > 0).length,
    });
  } catch (err) {
    console.error("import csv error:", err);
    res.status(500).json({ message: "Import failed" });
  }
});

export default router;
