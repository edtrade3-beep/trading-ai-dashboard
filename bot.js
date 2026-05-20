/**
 * Standalone Telegram bot runner.
 * Run this in a separate terminal: node bot.js
 * The main HTTP server does NOT need to be restarted.
 */
const fs   = require("node:fs");
const path = require("node:path");

// Load .env (same logic as server.js)
(function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, "utf8").split(/\r?\n/).forEach(line => {
    const t = line.trim();
    if (!t || t.startsWith("#")) return;
    const eq = t.indexOf("=");
    if (eq < 1) return;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(k in process.env)) process.env[k] = v;
  });
})();

const { startTelegramBot } = require("./src/telegram-bot");

startTelegramBot();
console.log("Bot running. Press Ctrl+C to stop.");
