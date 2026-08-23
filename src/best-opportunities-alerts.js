// best-opportunities-alerts.js — real Telegram alert when a genuinely NEW
// actionable buy-point setup appears in Best Opportunities Now's scan
// universe (explicit user request, 2026-08-03: "alert me on go not
// working"). The existing "Alert me on new GO" button (terminal-panels.jsx/
// BestOppNotifier) is a browser Notification-API-only alert — it silently
// does nothing if permission was ever denied, and it stops working the
// instant the tab (or browser) is closed, since there is no server-side
// channel behind it. This job is the durable equivalent: it survives a
// closed tab and reaches Telegram the same way every other real alert in
// this app does.
//
// Migrated off row.verdict/row.atBuyPoint (Master Build Spec phase 8,
// 2026-08-23) — those fields were _buildTrendTemplate's own baked-in
// legacy verdict system (routes/market.js), left deliberately untouched
// here since it has real, wide fan-out elsewhere (Autopilot's
// auto-watchlist gate, 2 client-side browser-notification triggers) this
// migration doesn't need to disturb. Only this alert's own trigger now
// reads the unified pipeline (buildEvFromRow -> computeEntryPlan ->
// computeRedFlags -> classifyDeepScanDecision), reused directly from
// watchlist-setup-alerts.js rather than duplicated — same contained
// pattern already established for 4 other alert files this session.
//
// Deliberately NOT scoped to the Watchlist (unlike watchlist-setup-alerts.js's
// own alert) — Best Opportunities' whole point is surfacing names the user
// may not be watching yet, so this scans the same real ~100-symbol universe
// BestOpportunities/BestOppNotifier use client-side. That universe lives in
// a client-only ESM file (axiom-runner/components/market-helpers.js) with
// no server-reachable export; advisor-ai.js already keeps its own
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
const { computeEntryPlan } = require("./entry-engine");
const { computeRedFlags } = require("./red-flag-engine");
const { computeCoreScore, classifyCoreVerdict } = require("./am-core-engine");
const { buildEvFromRow, shouldAlert } = require("./watchlist-setup-alerts");

const STORE_PATH = path.join(ROOT, "data", "best-opportunities-alert-state.json");

function loadState() {
  return readJsonSafe(STORE_PATH, {});
}
function saveState(s) {
  writeJsonAtomic(STORE_PATH, s);
}

// Real, pure "leaders only" quality bar — same real filter the client's
// default "Leaders only (RS≥70)" view applies, kept as a deliberate,
// disclosed additional bar on top of the unified decision (Master Build
// Spec phase 8). Extracted so it's independently testable.
function qualifiesAsLeader(r) {
  return Number(r.entry) > Number(r.stop) && (r.passCount || 0) >= 6 && !r.extended && (r.rsRating || 0) >= 70;
}

async function checkBestOpportunitiesAlerts() {
  if (!telegramConfigured()) return { ok: true, skipped: "telegram not configured" };
  if (!isMarketHoursET()) return { ok: true, skipped: "outside market hours" };

  let screenTrendTemplate, fetchMarketQuotes, computeRegime, regimeToEntryVocabulary, computeAPlusScore;
  try {
    ({ screenTrendTemplate, fetchMarketQuotes } = require("./routes/market"));
    ({ computeRegime, regimeToEntryVocabulary, computeAPlusScore } = require("./trade-planner-scoring"));
  } catch {
    return { ok: false, checked: 0, alerts: [] };
  }

  const macroRows = await fetchMarketQuotes(["SPY", "QQQ", "VIXY"], resolveProviderKeys(new URLSearchParams())).catch(() => []);
  const regime = computeRegime(Array.isArray(macroRows) ? macroRows : []);
  const marketRegime = regimeToEntryVocabulary(regime.label);

  const rows = await screenTrendTemplate(SCAN_UNIVERSE, {}).catch(() => []);

  const prev = loadState();
  const next = { ...prev };
  const alerts = [];

  for (const r of rows) {
    if (!r || r.error) continue;
    const ev = buildEvFromRow(r, marketRegime);
    const entryPlan = computeEntryPlan(ev);
    const redFlagResult = computeRedFlags(ev);
    const { score: aPlusScore } = computeAPlusScore(r, regime);
    const coreScore = computeCoreScore({
      passCount: r.passCount, rsRating: r.rsRating, momentum: r.momentum,
      stage: r.stage, volRatio: r.volRatio, regime, sectorInfo: null,
      adx: null, smc: r.smc, epsGrowth: r.epsGrowth, vcpScore: r.vcpScore,
      riskPct: r.riskPct, pctFromHigh: r.pctFromHigh, antiChase: ev.antiChase,
      optionsFlow: null, dollarVolume: r.dollarVolume,
    });
    const deep = classifyCoreVerdict({
      score: coreScore.score, entryPlan, redFlagResult,
      stage: r.stage, dailyBias: ev.dailyBias, entryScore: aPlusScore,
      hasPosition: false,
    });

    // Preserved as a deliberate, disclosed additional bar on top of the
    // unified verdict, not replaced by it: forcing a non-qualifying row
    // to an honest "WAIT" reading lets shouldAlert's already-tested
    // transition/red-flag/first-seed logic handle the rest unchanged.
    const decision = qualifiesAsLeader(r) ? deep.verdict : "WAIT";
    const last = prev[r.symbol];

    if (shouldAlert(last, decision, redFlagResult.criticalCount)) {
      alerts.push({ symbol: r.symbol, price: r.price, entry: entryPlan.entryPrice, stop: entryPlan.stop, target: entryPlan.target1, rsRating: r.rsRating, decision });
    }
    next[r.symbol] = decision;
  }

  saveState(next);

  if (alerts.length) {
    const fmt = (v) => Number.isFinite(v) ? `$${Number(v).toFixed(2)}` : "—";
    const lines = alerts.map((a) =>
      `🎯 ${a.symbol}: new ${a.decision.replace(/_/g, " ")} at ${fmt(a.price)} — entry ${fmt(a.entry)}, stop ${fmt(a.stop)}${a.target != null ? `, target ${fmt(a.target)}` : ""} · RS ${a.rsRating}`
    );
    pushDigestLines("opportunity", "⚡ BEST OPPORTUNITIES — NEW GO", lines);
  }

  return { ok: true, checked: rows.length, alerts };
}

module.exports = { checkBestOpportunitiesAlerts, qualifiesAsLeader };
