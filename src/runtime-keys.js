// Runtime key store — lets keys be set from the app UI (persisted to .env so they survive restarts).
// Falls back to process.env. On Render the filesystem is ephemeral, so there prefer the dashboard env vars.
const fs = require("node:fs");
const path = require("node:path");

const ENV_PATH = path.join(__dirname, "..", ".env");
const overrides = {};

function getKey(name, fallback = "") {
  return (overrides[name] || process.env[name] || fallback || "").trim();
}

function persist(name, value) {
  try {
    let txt = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
    const line = `${name}=${value}`;
    const re = new RegExp(`^${name}=.*$`, "m");
    if (re.test(txt)) txt = txt.replace(re, line);
    else txt += (txt && !txt.endsWith("\n") ? "\n" : "") + line + "\n";
    fs.writeFileSync(ENV_PATH, txt);
  } catch { /* read-only fs (e.g. Render) — in-memory override still applies for this process */ }
}

function setKey(name, value) {
  overrides[name] = String(value || "").trim();
  process.env[name] = overrides[name];
  persist(name, overrides[name]);
}

module.exports = { getKey, setKey };
