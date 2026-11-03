// File storage abstraction. Routes only ever call save/getStream/remove, so
// this file is the ONLY place that knows where files live.
//
// Two drivers:
//   - "disk" (default): server/uploads — for local development and tests.
//   - "cloudinary": set STORAGE_DRIVER=cloudinary plus the CLOUDINARY_* vars.
//     Used in production, where the server's own disk is wiped on restarts.
//     Files are uploaded as "authenticated" assets, so they have NO public
//     URL — delivery needs a signed URL that only this server can generate.
import fs from "fs";
import path from "path";
import https from "https";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { v2 as cloudinary } from "cloudinary";

const useCloudinary = process.env.STORAGE_DRIVER === "cloudinary";

if (useCloudinary) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

/* ------------------------------ disk driver ------------------------------ */

// Files live outside the web root, under server/uploads (gitignored).
const UPLOAD_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "uploads"
);
if (!useCloudinary) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/** Resolve a key to its absolute path, refusing anything that escapes the dir. */
function pathFor(key) {
  const p = path.join(UPLOAD_DIR, key);
  if (!p.startsWith(UPLOAD_DIR + path.sep)) throw new Error("Invalid file key");
  return p;
}

/* --------------------------- cloudinary driver ---------------------------- */

// All files go through resource_type "raw" (works for PDFs and images alike)
// under one folder, keyed by the same random name the disk driver would use.
const CLOUD_OPTS = { resource_type: "raw", type: "authenticated" };

function cloudId(key) {
  if (!/^[a-f0-9]{32}\.[a-z0-9]+$/.test(key)) throw new Error("Invalid file key");
  return `renewkeep/${key}`;
}

/* -------------------------------- public API ------------------------------ */

/**
 * Save a buffer. Returns the storage key (a random filename — the original
 * name is kept in the database only, never in storage).
 * @param {Buffer} buffer
 * @param {string} ext e.g. ".pdf" (dot included)
 */
export async function save(buffer, ext) {
  const key = crypto.randomBytes(16).toString("hex") + ext;
  if (useCloudinary) {
    await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { ...CLOUD_OPTS, public_id: cloudId(key) },
        (err, result) => (err ? reject(err) : resolve(result))
      );
      stream.end(buffer);
    });
  } else {
    await fs.promises.writeFile(pathFor(key), buffer);
  }
  return key;
}

/** Readable stream for a stored file. Rejects if the key does not exist. */
export async function getStream(key) {
  if (useCloudinary) {
    // Signed, short-lived delivery URL — generated server-side, never exposed.
    const url = cloudinary.url(cloudId(key), { ...CLOUD_OPTS, sign_url: true });
    return new Promise((resolve, reject) => {
      https
        .get(url, (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`File missing from storage (${res.statusCode})`));
          }
          resolve(res);
        })
        .on("error", reject);
    });
  }
  const p = pathFor(key);
  if (!fs.existsSync(p)) throw new Error("File missing from storage");
  return fs.createReadStream(p);
}

/** Delete a stored file. A key that is already gone is not an error. */
export async function remove(key) {
  if (useCloudinary) {
    // destroy() reports "not found" in the result body, not as an error — fine.
    await cloudinary.uploader.destroy(cloudId(key), CLOUD_OPTS);
    return;
  }
  try {
    await fs.promises.unlink(pathFor(key));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}
