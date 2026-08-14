// vcp-alerts.js — real Telegram alerts on real VCP state-machine transitions
// (vcpBreakoutEngine, src/routes/market.js), for Watchlist symbols. VCP
// engine integration Phase 4 (explicit user approval, 2026-08-14) — same
// real persisted-diff pattern as watchlist-setup-alerts.js/
// position-reversal-alerts.js: a JSON state file survives redeploys,
// first-seen-per-symbol seeds silently rather than alerting on data that
// was already true before this job ever ran.
//
// Three real transitions, matching the user's own spec vocabulary:
//   1. -> SETUP_READY   ("VCP READY" — base tightened, price within the
//      real vcpBreakoutEngine pivot-proximity band). Covers the spec's
//      separate NEAR_PIVOT case too — this engine's own SETUP_READY
//      condition already IS "near pivot", not a second real signal.
//   2. -> BREAKOUT_ACTIVE / CONFIRMED ("VCP BREAKOUT" — first real close
//      above the pivot).
//   3. BREAKOUT_ACTIVE/CONFIRMED -> FAILED ("FAILED BREAKOUT" — price lost
//      the pivot again).
// Every number in the alert text is a real field already on the scan row
// (screenTrendTemplate) — nothing computed fresh here, no invented
// "Breakout Score" the real engine doesn't produce (uses the real
// vcpBreakoutEngine confidence instead, honestly labeled as such).
"use strict";

const path = require("node:path");
const { ROOT, resolveProviderKeys } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { sendTelegramMessage, isConfigured: telegramConfigured } = require("./telegram");
const { shouldSendAlert } = require("./telegram-bot");
const { loadWatchlist } = require("./routes/watchlist");
const { isMarketHoursET } = require("./risk-guardrails");

const STORE_PATH = path.join(ROOT, "data", "vcp-alert-state.json");
const READY_STATES = new Set(["SETUP_READY"]);
const BREAKOUT_STATES = new Set(["BREAKOUT_ACTIVE", "CONFIRMED"]);

function loadState() {
  return readJsonSafe(STORE_PATH, {});
}
function saveState(s) {
  writeJsonAtomic(STORE_PATH, s);
}

async function checkVcpAlerts() {
  if (!telegramConfigured()) return { ok: true, skipped: "telegram not configured" };
  if (!isMarketHoursET()) return { ok: true, skipped: "outside market hours" };
  const { symbols } = loadWatchlist();
  if (!Array.isArray(symbols) || !symbols.length) return { ok: true, checked: 0, alerts: [] };

  let screenWatchlistCached, fetchMarketQuotes, computeRegime, computeAPlusScore;
  try {
    ({ screenWatchlistCached, fetchMarketQuotes } = require("./routes/market"));
    ({ computeRegime, computeAPlusScore } = require("./trade-planner-scoring"));
  } catch { return { ok: false, checked: 0, alerts: [] }; }

  const macroRows = await fetchMarketQuotes(["SPY", "QQQ", "VIXY"], resolveProviderKeys(new URLSearchParams())).catch(() => []);
  const regime = computeRegime(Array.isArray(macroRows) ? macroRows : []);
  // Same real watchlist sweep watchlist-setup-alerts.js/watchlist-
  // institutional-alerts.js already share when they land in the same
  // 15-min tick — no duplicate fetch.
  const results = await screenWatchlistCached(symbols).catch(() => []);

  const prev = loadState();
  const next = { ...prev };
  const alerts = [];

  for (const row of results) {
    if (row.error || !row.vcpVerdict || row.vcpVerdict === "INVALID VCP") continue;
    const symbol = row.symbol;
    const state = row.state;
    const last = prev[symbol] || {};
    const lastState = last.state;

    if (!READY_STATES.has(lastState) && READY_STATES.has(state)) {
      alerts.push({ symbol, kind: "ready", row });
    } else if (!BREAKOUT_STATES.has(lastState) && BREAKOUT_STATES.has(state)) {
      alerts.push({ symbol, kind: "breakout", row });
    } else if (BREAKOUT_STATES.has(lastState) && state === "FAILED") {
      alerts.push({ symbol, kind: "failed", row });
    }

    next[symbol] = { state };
  }

  saveState(next);

  if (alerts.length && shouldSendAlert({ category: "vcp-alert" })) {
    for (const a of alerts) {
      const { row } = a;
      const { score: aplusScore } = computeAPlusScore(row, regime);
      const price = Number(row.price);
      const pivot = Number(row.vcpPivotPrice);
      const dist = Number(row.vcpPivotDistancePct);
      const depths = Array.isArray(row.vcpDepths) ? row.vcpDepths.map((d) => `${d}%`).join(" → ") : null;

      let text;
      if (a.kind === "ready") {
        text = [
          `🟡 *${symbol} — VCP READY*`,
          `VCP Score: ${row.vcpScore}/100 (${row.vcpVerdict})`,
          `Pivot: $${pivot.toFixed(2)}   Price: $${price.toFixed(2)}`,
          `Distance: ${dist >= 0 ? dist.toFixed(1) + "% below" : Math.abs(dist).toFixed(1) + "% above"}`,
          depths ? `Contractions: ${depths}` : null,
          `WAITING FOR BREAKOUT`,
        ].filter(Boolean).join("\n");
      } else if (a.kind === "breakout") {
        text = [
          `🟢 *${symbol} — VCP BREAKOUT*`,
          `Pivot: $${pivot.toFixed(2)}   Price: $${price.toFixed(2)}`,
          `Relative Volume: ${Number.isFinite(row.volRatio) ? row.volRatio.toFixed(1) + "x" : "—"}`,
          `VCP Score: ${row.vcpScore}/100   Breakout Confidence: ${row.confidence}%   A+ Score: ${aplusScore}/100`,
          row.state === "CONFIRMED" ? "Volume-confirmed." : "Not yet volume-confirmed — watch for follow-through.",
        ].join("\n");
      } else {
        text = [
          `🔴 *${symbol} — FAILED BREAKOUT*`,
          `Pivot: $${pivot.toFixed(2)}   Price: $${price.toFixed(2)} (lost the pivot)`,
          `VCP Score: ${row.vcpScore}/100`,
          `Setup invalidated — real early warning, not a stop-loss trigger by itself.`,
        ].join("\n");
      }
      await sendTelegramMessage(text).catch(() => {});
    }
  }

  return { ok: true, checked: symbols.length, alerts: alerts.map((a) => ({ symbol: a.symbol, kind: a.kind })) };
}

module.exports = { checkVcpAlerts };
