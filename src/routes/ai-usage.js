// routes/ai-usage.js — read-only surface for the real Anthropic usage
// ledger (src/anthropic-usage-store.js) that already tracks every real
// API call's real cost, but until now had no read path anywhere in the
// app (only checkBudgetWarnings' Telegram alert consumed it). Added
// 2026-08-18 after a real operational incident (an accidental duplicate
// Future Wallet agent-swarm run) made the user ask to check real spend —
// there was nowhere in the app to actually see it. Every number here is
// Anthropic's own real usage/cost data for that call, nothing estimated
// except the explicitly-labeled month-end projection (a plain linear
// extrapolation of the real observed daily rate, same honest framing as
// getMonthEndProjection's own doc comment).
"use strict";

const { writeJson } = require("../utils");
const {
  getTodayUsage, getMonthUsage, getMonthEndProjection, getAverageDailySpend,
  getRemainingBudget, getCostByFeature,
} = require("../anthropic-usage-store");

const BUDGET_USD = 25;

async function handleAiUsage(req, res, requestUrl) {
  const { pathname } = requestUrl;
  if (pathname !== "/api/ai-usage" || req.method !== "GET") {
    return writeJson(res, 404, { ok: false, error: "Not found" });
  }
  const today = getTodayUsage();
  const month = getMonthUsage();
  return writeJson(res, 200, {
    ok: true,
    budgetUSD: BUDGET_USD,
    today,
    month,
    remainingBudgetUSD: getRemainingBudget(BUDGET_USD),
    monthEndProjectionUSD: getMonthEndProjection(),
    averageDailySpendUSD: getAverageDailySpend(),
    byFeature: getCostByFeature(),
  });
}

module.exports = { handleAiUsage };
