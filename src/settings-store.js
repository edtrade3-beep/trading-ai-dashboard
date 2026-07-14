const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STORE_PATH = path.join(ROOT, "data", "settings.json");

function loadSettings() {
  const parsed = readJsonSafe(STORE_PATH, {});
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

function saveSettings(settings) {
  try {
    writeJsonAtomic(STORE_PATH, settings);
  } catch {}
}

module.exports = { loadSettings, saveSettings };
