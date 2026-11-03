import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import Item, { ITEM_TYPES } from "../models/Item.js";
import * as storage from "../utils/storage.js";
import { protect } from "../middleware/auth.js";
import { tenantScope } from "../middleware/tenant.js";
import {
  todayInTz,
  isValidDateStr,
  statusFor,
  daysBetween,
  expiryFilterForStatus,
} from "../utils/dates.js";

const router = express.Router();

// Everything below is authenticated and tenant-scoped.
router.use(protect, tenantScope);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STATUSES = ["expired", "red", "amber", "green"];

/**
 * Validate item input. partial=true (updates) only checks provided fields.
 * Returns { data } with cleaned values, or { error } with a message.
 */
function validateItem(body, { partial = false } = {}) {
  const b = body || {};
  const data = {};

  const need = (field) => !partial || b[field] !== undefined;

  if (need("type")) {
    if (!ITEM_TYPES.includes(b.type))
      return { error: `Type must be one of: ${ITEM_TYPES.join(", ")}` };
    data.type = b.type;
  }
  if (need("title")) {
    if (typeof b.title !== "string" || !b.title.trim())
      return { error: "Title is required" };
    if (b.title.trim().length > 160)
      return { error: "Title must be 160 characters or fewer" };
    data.title = b.title.trim();
  }
  if (need("expiryDate")) {
    if (!isValidDateStr(b.expiryDate))
      return { error: "Expiry date must be a valid YYYY-MM-DD date" };
    data.expiryDate = b.expiryDate;
  }

  for (const [field, max] of [
    ["holderName", 120],
    ["issuer", 120],
    ["number", 80],
    ["notes", 2000],
  ]) {
    if (b[field] !== undefined) {
      if (typeof b[field] !== "string" || b[field].length > max)
        return { error: `Invalid ${field}` };
      data[field] = b[field].trim();
    }
  }

  if (b.notifyEmails !== undefined) {
    if (!Array.isArray(b.notifyEmails) || b.notifyEmails.length > 10)
      return { error: "notifyEmails must be a list of up to 10 emails" };
    const cleaned = b.notifyEmails.map((e) => String(e).trim().toLowerCase()).filter(Boolean);
    for (const e of cleaned)
      if (!EMAIL_RE.test(e)) return { error: `Invalid notification email: ${e}` };
    data.notifyEmails = [...new Set(cleaned)];
  }

  return { data };
}

/** Shape an item for the client, adding computed status + daysLeft. */
export function toClient(item, today) {
  return {
    id: item._id,
    type: item.type,
    title: item.title,
    holderName: item.holderName,
    issuer: item.issuer,
    number: item.number,
    expiryDate: item.expiryDate,
    notes: item.notes,
    notifyEmails: item.notifyEmails,
    file: item.file
      ? {
          originalName: item.file.originalName,
          mimeType: item.file.mimeType,
          size: item.file.size,
        }
      : null,
    renewedAt: item.renewedAt,
    createdAt: item.createdAt,
    status: statusFor(item.expiryDate, today),
    daysLeft: daysBetween(today, item.expiryDate),
  };
}

function findIdFilter(req) {
  if (!mongoose.isValidObjectId(req.params.id)) return null;
  // Tenant scope on every by-id lookup: wrong company -> 404, never 403,
  // so IDs can't be probed across tenants.
  return { _id: req.params.id, ...req.tenantFilter };
}

// GET /api/items?search=&type=&status=&sort=
router.get("/", async (req, res) => {
  try {
    const today = todayInTz(req.company.timezone);
    const { search, type, status, sort } = req.query;
    const filter = { ...req.tenantFilter };

    if (type) {
      if (!ITEM_TYPES.includes(type))
        return res.status(400).json({ message: "Unknown type filter" });
      filter.type = type;
    }
    if (status) {
      if (!STATUSES.includes(status))
        return res.status(400).json({ message: "Unknown status filter" });
      filter.expiryDate = expiryFilterForStatus(status, today);
    }
    if (search && typeof search === "string") {
      // Escape regex metacharacters so user input is a literal search.
      const safe = search.trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (safe)
        filter.$or = [
          { title: new RegExp(safe, "i") },
          { holderName: new RegExp(safe, "i") },
          { issuer: new RegExp(safe, "i") },
          { number: new RegExp(safe, "i") },
        ];
    }

    const sortMap = {
      expiry: { expiryDate: 1 },
      title: { title: 1 },
      newest: { createdAt: -1 },
    };
    const sortBy = sortMap[sort] || sortMap.expiry; // default: expiry soonest

    const items = await Item.find(filter).sort(sortBy).limit(500);
    res.json({
      items: items.map((i) => toClient(i, today)),
      today,
      timezone: req.company.timezone,
    });
  } catch (err) {
    console.error("list items error:", err);
    res.status(500).json({ message: "Could not load items" });
  }
});

// POST /api/items
router.post("/", async (req, res) => {
  try {
    const { data, error } = validateItem(req.body);
    if (error) return res.status(400).json({ message: error });
    if (!data.type || !data.title || !data.expiryDate)
      return res.status(400).json({ message: "Type, title and expiry date are required" });

    // Free-plan limit, counted inside the tenant only.
    const count = await Item.countDocuments(req.tenantFilter);
    if (count >= req.company.itemLimit)
      return res.status(403).json({
        message: `Plan limit reached (${req.company.itemLimit} items)`,
      });

    const item = await Item.create({
      ...data,
      companyId: req.company._id,
      createdBy: req.user._id,
    });
    res.status(201).json({ item: toClient(item, todayInTz(req.company.timezone)) });
  } catch (err) {
    console.error("create item error:", err);
    res.status(500).json({ message: "Could not create item" });
  }
});

// GET /api/items/:id
router.get("/:id", async (req, res) => {
  try {
    const filter = findIdFilter(req);
    const item = filter && (await Item.findOne(filter));
    if (!item) return res.status(404).json({ message: "Item not found" });
    res.json({ item: toClient(item, todayInTz(req.company.timezone)) });
  } catch (err) {
    console.error("get item error:", err);
    res.status(500).json({ message: "Could not load item" });
  }
});

// PUT /api/items/:id
router.put("/:id", async (req, res) => {
  try {
    const filter = findIdFilter(req);
    const item = filter && (await Item.findOne(filter));
    if (!item) return res.status(404).json({ message: "Item not found" });

    const { data, error } = validateItem(req.body, { partial: true });
    if (error) return res.status(400).json({ message: error });

    Object.assign(item, data);
    await item.save();
    res.json({ item: toClient(item, todayInTz(req.company.timezone)) });
  } catch (err) {
    console.error("update item error:", err);
    res.status(500).json({ message: "Could not update item" });
  }
});

// POST /api/items/:id/renew — mark renewed: new expiry date, fresh cycle.
router.post("/:id/renew", async (req, res) => {
  try {
    const filter = findIdFilter(req);
    const item = filter && (await Item.findOne(filter));
    if (!item) return res.status(404).json({ message: "Item not found" });

    const { expiryDate } = req.body || {};
    if (!isValidDateStr(expiryDate))
      return res.status(400).json({ message: "New expiry date must be a valid YYYY-MM-DD date" });

    item.expiryDate = expiryDate;
    item.renewedAt = new Date();
    await item.save();
    res.json({ item: toClient(item, todayInTz(req.company.timezone)) });
  } catch (err) {
    console.error("renew item error:", err);
    res.status(500).json({ message: "Could not renew item" });
  }
});

// DELETE /api/items/:id
router.delete("/:id", async (req, res) => {
  try {
    const filter = findIdFilter(req);
    const item = filter && (await Item.findOneAndDelete(filter));
    if (!item) return res.status(404).json({ message: "Item not found" });
    if (item.file?.key) await storage.remove(item.file.key);
    res.json({ message: "Item deleted" });
  } catch (err) {
    console.error("delete item error:", err);
    res.status(500).json({ message: "Could not delete item" });
  }
});

/* ---------------------------- file attachment ---------------------------- */

// Allowed types, with the extension used for the stored key and the magic
// bytes we verify so a renamed .exe can't sneak in as a "PDF".
const FILE_TYPES = {
  "application/pdf": { ext: ".pdf", magic: (b) => b.slice(0, 4).toString() === "%PDF" },
  "image/jpeg": { ext: ".jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 },
  "image/png": {
    ext: ".png",
    magic: (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  "image/webp": {
    ext: ".webp",
    magic: (b) => b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP",
  },
};
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// Memory storage: the buffer is handed to storage.save(), so multer never
// needs to know where files live — only storage.js does.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

// Wraps multer so its errors come back as our { message } shape.
function uploadSingle(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (err?.code === "LIMIT_FILE_SIZE")
      return res.status(400).json({ message: "File is too large (max 5 MB)" });
    if (err) return res.status(400).json({ message: "Upload failed" });
    next();
  });
}

// POST /api/items/:id/file — attach (or replace) the item's document.
router.post("/:id/file", uploadSingle, async (req, res) => {
  try {
    const filter = findIdFilter(req);
    const item = filter && (await Item.findOne(filter));
    if (!item) return res.status(404).json({ message: "Item not found" });

    if (!req.file)
      return res.status(400).json({ message: "No file provided (field name: file)" });

    const type = FILE_TYPES[req.file.mimetype];
    if (!type || !type.magic(req.file.buffer))
      return res.status(400).json({ message: "Only PDF, JPG, PNG or WebP files are allowed" });

    const key = await storage.save(req.file.buffer, type.ext);

    // Replace: remove the previous file only after the new one is saved.
    const oldKey = item.file?.key;
    item.file = {
      key,
      originalName: String(req.file.originalname || "document").slice(0, 200),
      mimeType: req.file.mimetype,
      size: req.file.size,
    };
    await item.save();
    if (oldKey) await storage.remove(oldKey);

    res.status(201).json({ item: toClient(item, todayInTz(req.company.timezone)) });
  } catch (err) {
    console.error("upload file error:", err);
    res.status(500).json({ message: "Could not save file" });
  }
});

// GET /api/items/:id/file — stream the file. Private: the tenant check in
// findIdFilter runs first, so there is no public URL to an upload, ever.
router.get("/:id/file", async (req, res) => {
  try {
    const filter = findIdFilter(req);
    const item = filter && (await Item.findOne(filter));
    if (!item || !item.file?.key)
      return res.status(404).json({ message: "File not found" });

    res.setHeader("Content-Type", item.file.mimeType);
    // RFC 5987 encoding so any original filename is safe in the header.
    const name = encodeURIComponent(item.file.originalName);
    const mode = req.query.download === "1" ? "attachment" : "inline";
    res.setHeader("Content-Disposition", `${mode}; filename*=UTF-8''${name}`);

    const stream = await storage.getStream(item.file.key);
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  } catch (err) {
    console.error("stream file error:", err);
    res.status(404).json({ message: "File not found" });
  }
});

// DELETE /api/items/:id/file
router.delete("/:id/file", async (req, res) => {
  try {
    const filter = findIdFilter(req);
    const item = filter && (await Item.findOne(filter));
    if (!item || !item.file?.key)
      return res.status(404).json({ message: "File not found" });

    const key = item.file.key;
    item.file = null;
    await item.save();
    await storage.remove(key);
    res.json({ message: "File removed" });
  } catch (err) {
    console.error("delete file error:", err);
    res.status(500).json({ message: "Could not remove file" });
  }
});

export default router;
