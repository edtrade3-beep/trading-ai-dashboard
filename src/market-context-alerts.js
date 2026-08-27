// market-context-alerts.js — Market Context Phase 1 (2026-08-27): a real
// regime-change push for macro-engine.js's own regime specifically. Two
// OTHER regime sources already push real regime-change alerts
// (market-scanner.js, command-center-ai.js) — this is the first push for
// the regime that actually powers the real Market Context UI, which was
// previously pull-only. Reuses the app's existing real alert
// infrastructure as-is: sendTelegramMessage's 60s/40-day caps
// (src/telegram.js) and telegram-bot.js's always-allow "regime-change"
// budget category — no new throttling invented.
"use strict";
const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STATE_PATH = path.join(ROOT, "data", "market-context-alert-state.json");

function loadState() {
  return readJsonSafe(STATE_PATH, { lastRegime: null, lastFedSignal: null });
}
function saveState(s) {
  writeJsonAtomic(STATE_PATH, s);
}

function fmtChg(v) {
  return Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(2)}%` : "—";
}
function fmtTrend(trend) {
  return trend === "rising" ? "↑" : trend === "falling" ? "↓" : "→";
}

// Real message, formatted per the spec's own §23 example — every line a
// real value from the real computed context, never a placeholder.
function formatMessage(context) {
  const inst = context.instruments || {};
  const lines = [
    "🚨 MARKET PULSE",
    `REGIME: ${context.regime.icon || ""} ${context.regime.label}`,
    `CONFIDENCE: ${context.confidence}%`,
    `2Y       ${fmtTrend(inst.twoYear?.trend)}${inst.twoYear ? ` ${inst.twoYear.value.toFixed(2)}%` : ""}`,
    `10Y      ${fmtTrend(inst.tenYear?.trend)}`,
    `DXY      ${inst.dxy ? fmtChg(inst.dxy.chgPct) : "—"}`,
    `VIX      ${inst.vix ? inst.vix.level.toFixed(1) : "—"}`,
    `OIL      ${inst.oil ? fmtChg(inst.oil.chgPct) : "—"}`,
    `GOLD     ${inst.gold ? fmtChg(inst.gold.chgPct) : "—"}`,
    `SPY      ${inst.spy ? fmtChg(inst.spy.chgPct) : "—"}`,
    `QQQ      ${inst.qqq ? fmtChg(inst.qqq.chgPct) : "—"}`,
    `FED: ${context.fedSignal?.signal?.replace("_REPRICING", "") || "UNKNOWN"}`,
    `MACRO SCORE: ${context.macroScore >= 0 ? "+" : ""}${context.macroScore}`,
    `TRADE ENVIRONMENT: ${context.tradingEnvironment.replace(/_/g, " ")}`,
  ];
  if (context.divergence && context.divergence !== "ALIGNED") {
    lines.push(`⚠️ ${context.divergence === "MACRO_EQUITY_DIVERGENCE" ? "MACRO/EQUITY DIVERGENCE" : "EQUITY WEAKNESS DESPITE DOVISH"}`);
  }
  if (context.explanation?.summary) lines.push("", context.explanation.summary);
  return lines.join("\n");
}

// Real tick — fires only on an ACTUAL real change in regime or Fed
// signal (never on every tick, never on first observation after a
// restart — matches the established pattern market-scanner.js/
// command-center-ai.js already use for their own regime alerts).
async function checkMarketContextAlerts() {
  const { computeMarketContext } = require("./market-context-engine");
  const { isConfigured, sendTelegramMessage } = require("./telegram");
  const { shouldSendAlert } = require("./telegram-bot");

  const context = await computeMarketContext().catch(() => null);
  if (!context || !context.available) return { sent: false, reason: "context unavailable" };

  const state = loadState();
  const regimeChanged = state.lastRegime != null && state.lastRegime !== context.regime.regime;
  const fedChanged = state.lastFedSignal != null && state.lastFedSignal !== context.fedSignal?.signal;
  const firstRun = state.lastRegime == null;

  saveState({ lastRegime: context.regime.regime, lastFedSignal: context.fedSignal?.signal ?? null });

  if (firstRun) return { sent: false, reason: "first observation — establishing baseline" };
  if (!regimeChanged && !fedChanged) return { sent: false, reason: "no real change" };
  if (!isConfigured()) return { sent: false, reason: "Telegram not configured" };
  if (!shouldSendAlert({ category: "regime-change" })) return { sent: false, reason: "budget gate declined (should not happen — regime-change is always-allow)" };

  await sendTelegramMessage(formatMessage(context));
  return { sent: true, regime: context.regime.regime, fedSignal: context.fedSignal?.signal };
}

module.exports = { checkMarketContextAlerts, formatMessage };
