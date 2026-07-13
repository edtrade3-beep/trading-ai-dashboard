const fs = require("node:fs");
const path = require("node:path");

// Shared helpers for the trading-critical flat-file JSON stores (journal,
// portfolio, autoexec config, etc.). Every store in this repo previously did
// a direct fs.writeFileSync — if the process crashes/is killed mid-write,
// that truncates the file, and the existing read paths all swallow the
// resulting JSON.parse error in a bare catch and silently fall back to an
// empty default. A corrupted file then looks identical to "no data yet" —
// real data loss with no trace it happened.

// Write JSON atomically: write to a temp file in the same directory, then
// rename over the real path. fs.renameSync is atomic on the same filesystem
// (true for every store here — always sibling files under data/) — a crash
// mid-write leaves an orphaned .tmp file, never a half-written real file.
function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmpPath, filePath);
}

// Read JSON, tolerating a missing file (returns fallback — genuinely "no
// data yet"). If the file EXISTS but fails to parse (real corruption), it's
// preserved under a .corrupt-<timestamp> name instead of being silently
// discarded, and a clear console.error is logged — same fallback-to-default
// behavior callers already had, but corruption is no longer invisible.
function readJsonSafe(filePath, fallback) {
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

module.exports = { writeJsonAtomic, readJsonSafe };
