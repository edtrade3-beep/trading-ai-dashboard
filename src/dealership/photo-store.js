// Server-side storage for vehicle listing photos. Public by design: these
// need to be fetchable by Meta's Marketplace feed crawler and by shoppers
// viewing /vehicle/:id. See src/router.js for the guard that keeps this the
// ONLY publicly-reachable subtree of data/.
//
// Backed by Postgres (bytea column) when DATABASE_URL is set, direct files
// on disk otherwise (local dev). Deliberately NOT folded into the shared
// in-memory-cache KV store in src/atomic-write.js — bulk-loading photo
// binaries into memory at boot risks real memory bloat as inventory grows
// (525 vehicles x up to 20 photos could be gigabytes), so this reads/writes
// Postgres directly and async instead. Small, contained set of callers:
// this file, src/dealership/routes.js's upload endpoint, src/router.js's
// serving route, and src/routes/inventory.js's delete-cleanup hook.

const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("../config");
const { writeBinaryAtomic } = require("../atomic-write");

const PHOTOS_ROOT = path.join(ROOT, "data", "photos");
const DATABASE_URL = (process.env.DATABASE_URL || "").trim();

let pool = null;

// Call once from server.js at startup, alongside atomic-write's
// initPgStore() — same fail-loudly contract: if DATABASE_URL is set but
// this can't connect/create its table, the caller should refuse to start
// rather than silently falling back to the ephemeral disk.
async function initPhotoStore() {
  if (!DATABASE_URL) return; // local dev / no DB configured — stays file-mode
  const { Pool } = require("pg");
  pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS photo_store (
      vehicle_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      content_type TEXT NOT NULL,
      data BYTEA NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (vehicle_id, filename)
    )
  `);
  console.log("[photo-store] Postgres photo store ready.");
}

function isDbMode() { return pool !== null; }

// Vehicle ids are numeric (nextId() in the client) but treat defensively —
// this id comes from a URL path segment, strip anything that isn't safe for
// a directory name / SQL key so it can never escape PHOTOS_ROOT.
function safeId(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, "");
}

function vehiclePhotosDir(id) {
  return path.join(PHOTOS_ROOT, safeId(id));
}

async function deletePhotosForVehicle(id) {
  if (isDbMode()) {
    await pool.query("DELETE FROM photo_store WHERE vehicle_id = $1", [safeId(id)]);
    return;
  }
  const dir = vehiclePhotosDir(id);
  if (dir.startsWith(PHOTOS_ROOT) && fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Replaces (not merges) a vehicle's photo set. `photos` is an array of
// {mediaType, data} (base64, already parsed by parseDataUrl). Returns the
// public URL paths in order, first = cover photo.
async function savePhotosForVehicle(id, photos) {
  await deletePhotosForVehicle(id);
  const vid = safeId(id);
  const urls = [];

  if (isDbMode()) {
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      const ext = p.mediaType === "image/png" ? "png" : "jpg";
      const filename = `${i + 1}.${ext}`;
      await pool.query(
        "INSERT INTO photo_store (vehicle_id, filename, content_type, data, updated_at) VALUES ($1, $2, $3, $4, now())",
        [vid, filename, p.mediaType, Buffer.from(p.data, "base64")]
      );
      urls.push(`/data/photos/${vid}/${filename}`);
    }
    return urls;
  }

  const dir = vehiclePhotosDir(id);
  photos.forEach((p, i) => {
    const ext = p.mediaType === "image/png" ? "png" : "jpg";
    const filePath = path.join(dir, `${i + 1}.${ext}`);
    writeBinaryAtomic(filePath, Buffer.from(p.data, "base64"));
    urls.push(`/data/photos/${vid}/${i + 1}.${ext}`);
  });
  return urls;
}

// DB-mode only — file-mode serving still goes through src/static.js's
// generic file serveStatic (see src/router.js), unchanged from before.
async function getPhoto(id, filename) {
  if (!isDbMode()) return null;
  const { rows } = await pool.query(
    "SELECT content_type, data FROM photo_store WHERE vehicle_id = $1 AND filename = $2",
    [safeId(id), String(filename || "").replace(/[^a-zA-Z0-9_.-]/g, "")]
  );
  if (!rows.length) return null;
  return { contentType: rows[0].content_type, data: rows[0].data };
}

module.exports = { savePhotosForVehicle, deletePhotosForVehicle, getPhoto, initPhotoStore, isDbMode, PHOTOS_ROOT };
