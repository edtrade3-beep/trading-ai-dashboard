// position-reversal-alerts.js — real Telegram alert when a HELD position
// shows the AI Sniper's early get-out signs (computeReversalDetector via
// computeSniperDecision, src/sniper-decision.js) — near the 52-week high,
// overbought RSI, climax volume, or a parabolic run cooling off. Explicit
// user request (2026-08-11: "I DONT WANT TO THINK TOO MUCH I WANT PLATFORM
// TO WORK ME" / "THE SYSTEM TELL ME EARLY OR ON TIME BUY SELL EARLY OR ON
// TIME").
//
// This is a REAL, structurally EARLIER exit signal than trailing-
// stops.js's own invalidation check (sellSignals — price closing below the
// 50-day MA/21-day EMA), which only fires once the trend has already
// broken. Complements that check, doesn't replace it — a stock can show
// real reversal risk well before its moving averages turn over. Alert
// only, never places or modifies an order — same read-only discipline as
// every other *-alerts.js job in this app.
"use strict";

const path = require("node:path");
const { ROOT, PORT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { sendTelegramMessage, isConfigured: telegramConfigured } = require("./telegram");
const { shouldSendAlert } = require("./telegram-bot");
const { resolveAlpacaKeys, alpacaTradingRequest } = require("./providers/alpaca-client");
const { computeSniperDecision } = require("./sniper-decision");

const STORE_PATH = path.join(ROOT, "data", "position-reversal-state.json");
const BASE = () => process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;

function loadState() { return readJsonSafe(STORE_PATH, {}); }
function saveState(v) { writeJsonAtomic(STORE_PATH, v); }

function isMarketHoursET() {
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay(); if (day < 1 || day > 5) return false;
  const mins = et.getHours() * 60 + et.getMinutes();
  return mins >= 9 * 60 + 35 && mins <= 15 * 60 + 55;
}

// Same shim contract as trailing-stops.js's apca() — never throws, this is
// a cron job that must survive a transient network/auth blip.
async function apca(pathStr) {
  try {
    const res = await alpacaTradingRequest(pathStr, "GET");
    if (res._noKey) return null;
    return { ok: res.ok, status: res.status, data: res.data };
  } catch { return null; }
}

async function checkPositionReversals() {
  if (!telegramConfigured()) return { ok: true, skipped: "telegram not configured" };
  const { id, secret } = resolveAlpacaKeys();
  if (!id || !secret) return { ok: true, skipped: "alpaca not configured" };
  if (!isMarketHoursET()) return { ok: true, skipped: "outside market hours" };

  const posR = await apca("/v2/positions");
  const positions = (posR && posR.ok && Array.isArray(posR.data)) ? posR.data.filter((p) => Number(p.qty) > 0) : [];
  if (!positions.length) return { ok: true, checked: 0, warnings: [] };

  let screenWatchlistCached;
  try { ({ screenWatchlistCached } = require("./routes/market")); } catch { return { ok: false, checked: 0, warnings: [] }; }

  const symbols = positions.map((p) => p.symbol);
  const rows = await screenWatchlistCached(symbols).catch(() => []);
  const prev = loadState();
  const next = { ...prev };
  const warnings = [];

  for (const row of rows) {
    if (row.error) continue;
    const symbol = row.symbol;
    const d = computeSniperDecision(row);
    const isRisk = !!(d.gates && d.gates.reversalTopRisk);
    const wasRisk = !!prev[symbol];
    next[symbol] = isRisk;
    if (isRisk && !wasRisk) warnings.push({ symbol, d });
  }
  saveState(next);

  if (warnings.length && shouldSendAlert({ category: "position-reversal" })) {
    for (const w of warnings) {
      const url = `${BASE()}/?symbol=${encodeURIComponent(w.symbol)}&open=sniper`;
      // Real dollar top/bottom levels, not just a percentage distance
      // (explicit user follow-up, 2026-08-13: "I still need to know when
      // the bottom and top prices" — this alert only ever said "Near 52w
      // high (-1.3%)" with no real price to act on).
      const rev = w.d.reversal;
      const text = [
        `⚠️ EARLY GET-OUT SIGNS — ${w.symbol} (you hold this)`,
        rev ? rev.verdict : "Reversal risk detected",
        rev && rev.sigs ? rev.sigs.map((s) => s.txt).join(", ") : null,
        rev && rev.hi52 != null ? `Top price (52w high): $${rev.hi52.toFixed(2)}` : null,
        rev && rev.lo52 != null ? `Bottom price (52w low): $${rev.lo52.toFixed(2)}` : null,
        "",
        "Real early warning, BEFORE a trend-invalidation break — not a stop-loss trigger. Worth checking whether to tighten your stop or take partial profits.",
        "", url,
      ].filter(Boolean);
      await sendTelegramMessage(text.join("\n"), { url, buttonText: `Open ${w.symbol} Sniper →` }).catch(() => {});
    }
  }

  return { ok: true, checked: positions.length, warnings };
}

module.exports = { checkPositionReversals };
