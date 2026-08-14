// best-opportunities-alerts.js — real Telegram alert when a genuinely NEW
// "GO" buy-point setup appears in Best Opportunities Now's scan universe
// (explicit user request, 2026-08-03: "alert me on go not working"). The
// existing "Alert me on new GO" button (terminal-panels.jsx/BestOppNotifier)
// is a browser Notification-API-only alert — it silently does nothing if
// permission was ever denied, and it stops working the instant the tab (or
// browser) is closed, since there is no server-side channel behind it. This
// job is the durable equivalent: it survives a closed tab and reaches
// Telegram the same way every other real alert in this app does.
//
// Deliberately NOT scoped to the Watchlist (unlike watchlist-setup-alerts.js's
// own atBuyPoint alert) — Best Opportunities' whole point is surfacing names
// the user may not be watching yet, so this scans the same real ~100-symbol
// universe BestOpportunities/BestOppNotifier use client-side. That universe
// lives in a client-only ESM file (axiom-runner/components/market-helpers.js)
// with no server-reachable export; advisor-ai.js already keeps its own
// SCAN_UNIVERSE synced 1:1 with that same list (see its own header comment),
// so this reuses that existing export rather than adding a 4th duplicate copy.
"use strict";

const path = require("node:path");
const { ROOT, resolveProviderKeys } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { isConfigured: telegramConfigured } = require("./telegram");
const { pushDigestLines } = require("./alert-buffer");
const { isMarketHoursET } = require("./risk-guardrails");
const { SCAN_UNIVERSE } = require("./advisor-ai");

const STORE_PATH = path.join(ROOT, "data", "best-opportunities-alert-state.json");

function loadState() {
  return readJsonSafe(STORE_PATH, {});
}
function saveState(s) {
  writeJsonAtomic(STORE_PATH, s);
}

// Same real criteria BestOpportunities/BestOppNotifier apply client-side:
// a real confirmed pivot breakout on volume, or the trend-screen route's own
// GO verdict — both off screenTrendTemplate's real fields, nothing fabricated.
function isGo(r) {
  return r.verdict === "GO" || (r.atBuyPoint && r.volConfirmed);
}

async function checkBestOpportunitiesAlerts() {
  if (!telegramConfigured()) return { ok: true, skipped: "telegram not configured" };
  if (!isMarketHoursET()) return { ok: true, skipped: "outside market hours" };

  let screenTrendTemplate;
  try {
    ({ screenTrendTemplate } = require("./routes/market"));
  } catch {
    return { ok: false, checked: 0, alerts: [] };
  }

  const rows = await screenTrendTemplate(SCAN_UNIVERSE, {}).catch(() => []);

  const prev = loadState();
  const next = { ...prev };
  const alerts = [];

  for (const r of rows) {
    if (!r || r.error) continue;
    // Same quality bar the client's default "Leaders only (RS≥70)" filter
    // applies — real leaders only, not every marginal setup in the universe.
    const qualifies = Number(r.entry) > Number(r.stop) && (r.passCount || 0) >= 6 && !r.extended && (r.rsRating || 0) >= 70;
    const go = qualifies && isGo(r);
    const last = prev[r.symbol] || {};

    if (last.go === false && go === true) {
      alerts.push({ symbol: r.symbol, price: r.price, entry: r.entry, stop: r.stop, target: r.target2, rsRating: r.rsRating });
    }
    next[r.symbol] = { go };
  }

  saveState(next);

  if (alerts.length) {
    const lines = alerts.map((a) =>
      `🎯 ${a.symbol}: new GO buy-point at $${Number(a.price).toFixed(2)} — entry $${a.entry}, stop $${a.stop}${a.target ? `, target $${a.target}` : ""} · RS ${a.rsRating}`
    );
    pushDigestLines("opportunity", "⚡ BEST OPPORTUNITIES — NEW GO", lines);
  }

  return { ok: true, checked: rows.length, alerts };
}

module.exports = { checkBestOpportunitiesAlerts };
