// Persists what ai-coach.js's scheduled AI functions already compute, so the
// app can show them on-screen instead of the output only ever reaching
// Telegram. One small store, keyed by report type — same
// writeJsonAtomic/readJsonSafe pattern as every other store in this repo.
const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STORE_PATH = path.join(ROOT, "data", "ai-coach-log.json");

function loadCoachLog() {
  return readJsonSafe(STORE_PATH, {});
}

// type: "apex" | "gameplan" | "tradeCoach" | "weekly" | "monthly"
function saveCoachOutput(type, data) {
  const log = loadCoachLog();
  log[type] = { ...data, savedAt: Date.now() };
  writeJsonAtomic(STORE_PATH, log);
}

module.exports = { loadCoachLog, saveCoachOutput };
