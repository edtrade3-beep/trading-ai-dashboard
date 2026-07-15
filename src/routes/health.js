const fs = require("node:fs");
const path = require("node:path");
const { writeJson, isOn } = require("../utils");
const { isConfigured: telegramConfigured } = require("../telegram");
const { ROOT } = require("../config");
const { getDbStatus } = require("../atomic-write");
const { isDbMode: photosDbMode } = require("../dealership/photo-store");

// Build marker — the deploy's git commit (stable across restarts/cold-starts; changes ONLY on a new deploy).
// Render sets RENDER_GIT_COMMIT automatically. Fall back to a fixed string so restarts don't trigger reloads.
const BUILD = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || "local";
const STARTED_AT = new Date().toISOString();

async function handleHealth(req, res) {
  const serverAutopilot = isOn(process.env.SERVER_AUTOPILOT);
  const meanrevPaper = isOn(process.env.MEANREV_PAPER);
  const apiAuth = !!(process.env.API_AUTH_TOKEN || "").trim();
  // Diagnostics: is the key even present on this service? (value length only, never the value)
  const envSeen = {
    MEANREV_PAPER: process.env.MEANREV_PAPER !== undefined,
    SERVER_AUTOPILOT: process.env.SERVER_AUTOPILOT !== undefined,
    ALPACA_KEY_ID: process.env.ALPACA_KEY_ID !== undefined,
    POLYGON_API_KEY: !!(process.env.POLYGON_API_KEY || "").trim(),
  };
  // Temporary diagnostic — dealer data (data/inventory.json) keeps getting
  // wiped on restart despite a disk being attached in the Render dashboard.
  // Compares the device id of ROOT/data against the expected disk mount
  // path: if they're the SAME device, the app's data dir isn't actually
  // sitting on the mounted disk at all, regardless of what the dashboard
  // shows as "attached". Remove once resolved.
  const dataDir = path.join(ROOT, "data");
  const expectedMount = "/opt/render/project/src/data";
  const diskDebug = { root: ROOT, dataDir, expectedMount };
  try { diskDebug.rootDev = fs.statSync(ROOT).dev; } catch (e) { diskDebug.rootErr = e.message; }
  try { diskDebug.dataDirDev = fs.statSync(dataDir).dev; } catch (e) { diskDebug.dataDirErr = e.message; }
  try { diskDebug.expectedMountExists = fs.existsSync(expectedMount); if (diskDebug.expectedMountExists) diskDebug.expectedMountDev = fs.statSync(expectedMount).dev; } catch (e) { diskDebug.expectedMountErr = e.message; }
  diskDebug.sameDeviceAsRoot = diskDebug.dataDirDev != null && diskDebug.rootDev != null && diskDebug.dataDirDev === diskDebug.rootDev;
  try {
    const invStat = fs.statSync(path.join(dataDir, "inventory.json"));
    diskDebug.inventoryFile = { sizeBytes: invStat.size, mtime: invStat.mtime };
  } catch (e) { diskDebug.inventoryFileErr = e.message; }

  // Postgres persistence status — verify this reports connected:true with a
  // real kvRowCount immediately after DATABASE_URL is set, before trusting
  // it with real data. If DATABASE_URL isn't set, the app stays in file
  // mode (same as always) and this just reports configured:false.
  const postgres = { ...getDbStatus(), photosConnected: photosDbMode() };

  return writeJson(res, 200, { ok: true, version: "market-v2", build: BUILD, startedAt: STARTED_AT, telegram: telegramConfigured(), serverAutopilot, meanrevPaper, apiAuth, envSeen, diskDebug, postgres });
}

module.exports = handleHealth;
