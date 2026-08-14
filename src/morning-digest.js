// morning-digest.js — once-daily consolidated Telegram summary, replacing
// 8 scattered "opportunity" pings with one clean read (explicit user
// request, 2026-08-14: "consolidate the alerts into one morning digest...
// fits the 15-seconds-every-morning goal best"). Deliberately calls the 8
// real check functions itself (rather than relying on their own
// independent 15-min server.js intervals to have already fired since
// open) so the digest is always built off a genuinely fresh same-morning
// scan, not whatever happened to be sitting in the buffer at whatever
// moment this job's own interval landed. Those 8 jobs' own intervals keep
// running too — this doesn't replace their real state-diffing logic
// (needed so an afternoon transition isn't lost, it just rolls into
// tomorrow's digest), only their delivery.
//
// Deliberately excludes position-reversal-alerts.js and paper-positions.js's
// reprice job — those cover actual held capital ("early get-out" / "Exit
// Now") and keep sending immediately, real-time. Batching a real risk
// signal on a held position into a once-a-day digest would be a safety
// regression, not just a UX tradeoff.
"use strict";

const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { sendTelegramMessage, isConfigured: telegramConfigured } = require("./telegram");
const { flushDigestBuffer } = require("./alert-buffer");
const { isMarketHoursET } = require("./risk-guardrails");

const STORE_PATH = path.join(ROOT, "data", "morning-digest-state.json");

const CHECKS = [
  () => require("./watchlist-turn-alerts").checkWatchlistTurns(),
  () => require("./watchlist-setup-alerts").checkWatchlistSetupAlerts(),
  () => require("./watchlist-greenlight-alerts").checkWatchlistGreenLightAlerts(),
  () => require("./watchlist-sniper-alerts").checkWatchlistSniperTurns(),
  () => require("./best-opportunities-alerts").checkBestOpportunitiesAlerts(),
  () => require("./bearish-setups-alerts").checkBearishSetupsAlerts(),
  () => require("./watchlist-institutional-alerts").checkWatchlistInstitutionalAlerts(),
  () => require("./vcp-alerts").checkVcpAlerts(),
];

function todayET() {
  return new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" });
}

async function checkMorningDigest() {
  if (!telegramConfigured()) return { ok: true, skipped: "telegram not configured" };
  if (!isMarketHoursET()) return { ok: true, skipped: "outside market hours" };

  const state = readJsonSafe(STORE_PATH, { lastSentDate: null });
  const today = todayET();
  if (state.lastSentDate === today) return { ok: true, skipped: "already sent today" };

  await Promise.allSettled(CHECKS.map((fn) => fn()));
  const items = flushDigestBuffer();

  // Mark today as sent regardless of item count — an honest "nothing new"
  // digest still beats silence, and prevents re-running all 8 real scans
  // again every 5 min for the rest of the day.
  writeJsonAtomic(STORE_PATH, { lastSentDate: today });

  const et = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" });
  const divider = "━━━━━━━━━━━━━━━━━━━━";
  const lines = [`☀️ MORNING BRIEF — ${today}, ${et} ET`, divider];

  if (!items.length) {
    lines.push("Nothing new — no real setup crossed a signal since the last brief.");
  } else {
    const byHeader = new Map();
    for (const it of items) {
      if (!byHeader.has(it.header)) byHeader.set(it.header, []);
      byHeader.get(it.header).push(...it.lines);
    }
    for (const [header, lns] of byHeader) {
      lines.push(header);
      lns.forEach((l) => lines.push(`  ${l}`));
      lines.push("");
    }
  }
  lines.push(divider);
  lines.push("Open Smart Scan / Cortex for the full read on any name above.");

  await sendTelegramMessage(lines.join("\n")).catch(() => {});

  return { ok: true, sent: true, count: items.length };
}

module.exports = { checkMorningDigest };
