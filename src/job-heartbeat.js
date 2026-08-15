// job-heartbeat.js — system health for the ~14 real background alert jobs
// registered in server.js. Every one of them today runs as
// `setInterval(() => job().catch(() => {}), N)` — a real, deliberate
// design (one job's error must never crash the process or block the
// others), but it also means a job that starts silently failing on every
// single tick (a provider API changed shape, a real code bug) produces
// zero real alerts forever with NO visibility — the exact failure mode
// that blocked a deploy earlier this same session until it was found by
// hand. This wraps that same fire-and-forget pattern, unchanged in
// behavior, but records whether each run actually completed — so a
// SUSTAINED run of failures (not a single transient one) can surface via
// Telegram instead of vanishing into an empty catch forever.
"use strict";

const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { sendTelegramMessage, isConfigured: telegramConfigured } = require("./telegram");

const STORE_PATH = path.join(ROOT, "data", "job-heartbeats.json");
const FAILURE_THRESHOLD = 3;              // consecutive failed runs before alerting — one bad tick is normal (a transient fetch timeout), three in a row is not
const ALERT_COOLDOWN_MS = 12 * 3600_000;  // don't re-alert on the same still-broken job more than every 12h

function loadHeartbeats() {
  return readJsonSafe(STORE_PATH, {});
}
function saveHeartbeats(h) {
  writeJsonAtomic(STORE_PATH, h);
}

// Same setInterval(fn, ms) shape every job in server.js already uses —
// drop-in replacement, not a new registration system. `fn` may return a
// promise (all real jobs here do); a rejection is still swallowed (same
// "one job's failure never blocks the interval" guarantee as before),
// just recorded first.
function registerJob(name, intervalMs, fn) {
  const tick = async () => {
    const hb = loadHeartbeats();
    const prev = hb[name] || {};
    try {
      await fn();
      hb[name] = { lastRunAt: new Date().toISOString(), lastOk: true, consecutiveFailures: 0, lastAlertedAt: prev.lastAlertedAt || null };
      saveHeartbeats(hb);
    } catch (err) {
      const consecutiveFailures = (prev.consecutiveFailures || 0) + 1;
      const lastError = err instanceof Error ? err.message : String(err);
      hb[name] = { lastRunAt: new Date().toISOString(), lastOk: false, consecutiveFailures, lastError, lastAlertedAt: prev.lastAlertedAt || null };
      saveHeartbeats(hb);
      console.error(`[${name}] failed (${consecutiveFailures} in a row):`, lastError);
      if (consecutiveFailures >= FAILURE_THRESHOLD && telegramConfigured()) {
        const lastAlertMs = hb[name].lastAlertedAt ? new Date(hb[name].lastAlertedAt).getTime() : 0;
        if (Date.now() - lastAlertMs > ALERT_COOLDOWN_MS) {
          hb[name].lastAlertedAt = new Date().toISOString();
          saveHeartbeats(hb);
          sendTelegramMessage(
            `⚠️ *${name}* has failed ${consecutiveFailures} times in a row.\nLast error: ${lastError}\nThis job's real alerts have gone silent — check Render logs.`
          ).catch(() => {});
        }
      }
    }
  };
  setInterval(tick, intervalMs);
}

module.exports = { registerJob, loadHeartbeats };
