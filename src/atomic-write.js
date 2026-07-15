const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("./config");

// Shared helpers for every flat-file JSON store in this app (journal,
// portfolio, dealer inventory, CRM leads, scanner state, and ~20 more).
//
// Backed by Postgres when DATABASE_URL is set (see initPgStore, called once
// from server.js before the server starts accepting requests), or by direct
// file writes when it isn't (local dev — zero setup, unchanged from before).
//
// Why Postgres and not just "fix the disk": a device-id diagnostic proved
// Render's persistent disk was never actually mounted for this service
// despite showing "attached" in the dashboard — data/ has been silently
// wiped on every deploy/restart for as long as this app has run there.
//
// Why an in-memory cache instead of awaiting Postgres on every call: these
// ~25 stores' read/write functions are synchronous everywhere they're
// called (dozens of call sites across the whole app). Making them async
// would mean auditing and updating every one of those call sites — wide,
// easy to get subtly wrong. Instead: reads/writes hit an in-memory Map
// synchronously (same behavior/timing as before), and writes are persisted
// to Postgres in the background, not awaited by the caller.
//
// Honest trade-off: a crash in the small window between the in-memory
// update and the background Postgres write landing could still lose that
// one write. Dramatically better than today's reality (100% loss on every
// restart), not full synchronous durability. Acceptable given how
// infrequent writes are for most of these stores.

const DATA_DIR = path.join(ROOT, "data");
const DATABASE_URL = (process.env.DATABASE_URL || "").trim();

let pool = null;   // pg Pool, set once initPgStore() succeeds
let cache = null;  // Map<key,value> once bootstrapped; null = file-mode

function keyFor(filePath) {
  return path.relative(DATA_DIR, filePath).split(path.sep).join("/");
}

// Call once from server.js before listen(), only when DATABASE_URL is set.
// Throws on failure — server.js should treat that as fatal and refuse to
// start. Silently falling back to ephemeral file storage here would
// recreate the exact "looks fine, isn't actually persisting" bug this
// module exists to fix.
async function initPgStore() {
  if (!DATABASE_URL) return; // no DB configured — stays in file mode
  const { Pool } = require("pg");
  pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  const { rows } = await pool.query("SELECT key, value FROM kv_store");
  cache = new Map(rows.map(r => [r.key, r.value]));
  console.log(`[atomic-write] Postgres store ready — ${cache.size} key(s) loaded.`);
}

function isDbMode() { return cache !== null; }
function deepClone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }

// Write JSON atomically: write to a temp file in the same directory, then
// rename over the real path. fs.renameSync is atomic on the same filesystem
// — a crash mid-write leaves an orphaned .tmp file, never a half-written
// real file. (File-mode only; DB mode has its own atomicity via Postgres.)
function writeJsonAtomic(filePath, data) {
  if (isDbMode()) {
    const key = keyFor(filePath);
    const clone = deepClone(data);
    cache.set(key, clone);
    pool.query(
      "INSERT INTO kv_store (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()",
      [key, JSON.stringify(clone)]
    ).catch(err => console.error(`[atomic-write] Postgres write failed for "${key}":`, err.message));
    return;
  }
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmpPath, filePath);
}

// Read JSON, tolerating "missing" (returns fallback — genuinely "no data
// yet" in file mode; absent from the cache in DB mode). File-mode also
// preserves a corrupted file under a .corrupt-<timestamp> name instead of
// silently discarding it, with a clear console.error.
function readJsonSafe(filePath, fallback) {
  if (isDbMode()) {
    const key = keyFor(filePath);
    const v = cache.get(key);
    return v === undefined ? fallback : deepClone(v);
  }
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    console.error(`[atomic-write] readJsonSafe: unexpected read error for ${filePath}:`, err.message);
    return fallback;
  }
  try {
    return JSON.parse(raw);
  } catch {
    const corruptPath = `${filePath}.corrupt-${Date.now()}`;
    try {
      fs.renameSync(filePath, corruptPath);
      console.error(`[atomic-write] ${filePath} was corrupted (invalid JSON) — preserved as ${corruptPath}, falling back to default.`);
    } catch (renameErr) {
      console.error(`[atomic-write] ${filePath} was corrupted AND could not be preserved:`, renameErr.message);
    }
    return fallback;
  }
}

// Same atomicity pattern as writeJsonAtomic, for binary data. File-mode
// only — the one caller (dealer vehicle photos) is migrated separately to
// its own async Postgres bytea storage (src/dealership/photo-store.js),
// since bulk-loading photo binaries into this module's in-memory cache
// would risk real memory bloat as inventory grows. This stays as the local-
// dev fallback for that store when DATABASE_URL isn't set.
function writeBinaryAtomic(filePath, buffer) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, buffer);
  fs.renameSync(tmpPath, filePath);
}

// For /api/health's diagnostic — reports whether DB mode is actually active
// and how many keys are cached, without exposing the pool/connection string.
function getDbStatus() {
  return { configured: Boolean(DATABASE_URL), connected: isDbMode(), kvRowCount: cache ? cache.size : null };
}

module.exports = { writeJsonAtomic, readJsonSafe, writeBinaryAtomic, initPgStore, isDbMode, getDbStatus };
