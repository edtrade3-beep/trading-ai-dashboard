"use strict";
// portfolio-event-concentration.js — real detection of multiple held
// positions sharing the same real near-term event window (2026-09-14
// platform audit, Priority 4 — confirmed genuine gap: portfolio-
// correlation-calc.js already does real PRICE-correlation clustering
// across the account's holdings, but nothing detects "three of my
// current positions all report earnings the same week," which is a
// distinct real risk).
//
// Reuses the exact same real per-symbol earnings-date extraction already
// proven in market-command-center.js's findWatchlistEarnings() and
// routes/market.js's best-options-now route (fetchYahooQuoteBatch's own
// real earningsTimestamp field) — never a second, independently-invented
// earnings lookup. Same real input convention as
// portfolio-correlation-calc.js's computePortfolioCorrelation(positions,
// getJson): a pure function over real positions the caller already
// fetched from /api/alpaca/positions, injectable fetch for real tests.
//
// Informational/advisory only, per explicit spec: "Do not automatically
// sell positions." This engine places no order and mutates no state. It
// is also NOT wired into the canonical AssetDecision / event-risk-
// engine.js risk override in this pass — newEntriesBlocked is always
// false; newEntriesReduced is a real, computed recommendation the caller
// can surface, not an enforced gate. Making this a real canonical
// blocking input is a separate, larger decision (it would affect verdict
// computation for every new-entry candidate, not just the held positions
// themselves) left for explicit approval before implementing.

const CONCENTRATION_VERSION = "portfolio-event-concentration-v1";
// "several earnings reports during one week" — the spec's own example.
const CLUSTER_WINDOW_DAYS = 7;

function classifyConcentration(exposurePct, clusterSize) {
  if (clusterSize < 2) return "NONE";
  if (exposurePct >= 30 || clusterSize >= 4) return "HIGH";
  if (exposurePct >= 15 || clusterSize >= 3) return "MODERATE";
  return "LOW";
}

function recommendedAction(level) {
  if (level === "HIGH") return "Reduce new exposure in this window — a large share of the portfolio reports earnings within days of each other.";
  if (level === "MODERATE") return "Size new entries smaller than usual in this window — a meaningful share of the portfolio has overlapping event risk.";
  if (level === "LOW") return "No portfolio-level action needed — overlapping events exist but exposure is small.";
  return "No overlapping event risk detected.";
}

// positions: real Alpaca positions [{symbol, marketValue, ...}].
// fetchQuoteBatch: injected (defaults to the real provider) so this stays
// testable against a real fixture, never a network call in tests.
async function computePortfolioEventConcentration(positions, { fetchQuoteBatch, nowMs = Date.now() } = {}) {
  const fetch = fetchQuoteBatch || require("./providers/yahoo").fetchYahooQuoteBatch;
  const posList = Array.isArray(positions) ? positions.filter((p) => p && p.symbol) : [];
  if (!posList.length) {
    return { engineVersion: CONCENTRATION_VERSION, clusters: [], totalPortfolioValue: 0, windowDays: CLUSTER_WINDOW_DAYS, generatedAt: new Date(nowMs).toISOString() };
  }
  const symbols = [...new Set(posList.map((p) => p.symbol))];
  const totalPortfolioValue = posList.reduce((s, p) => s + (Number(p.marketValue) || 0), 0);

  let quotes = [];
  try { quotes = await fetch(symbols); } catch { quotes = []; }

  const eventBySymbol = {};
  for (const q of quotes || []) {
    const sym = String(q?.symbol || "").toUpperCase();
    if (!sym) continue;
    const ts = Number((Array.isArray(q?.earningsTimestamp) ? q.earningsTimestamp[0] : q?.earningsTimestamp) || 0);
    if (!ts) continue;
    const atMs = ts * 1000;
    const dte = (atMs - nowMs) / 86400000;
    // Only real, imminent, in-window events — a past or far-future real
    // earnings date isn't a current concentration risk.
    if (dte < 0 || dte > CLUSTER_WINDOW_DAYS) continue;
    eventBySymbol[sym] = { date: new Date(atMs).toISOString(), dte: Math.round(dte * 10) / 10 };
  }

  // Real, deterministic sliding-window clustering over real sorted dates:
  // each cluster anchors on its earliest real event and pulls in every
  // later real event within CLUSTER_WINDOW_DAYS of THAT anchor — not a
  // fabricated "same calendar week" bucket, which could otherwise split
  // two events 6 real days apart into different buckets just because
  // they cross a Sunday. A real consequence, disclosed here rather than
  // hidden: two events father apart than the window from their own
  // cluster's anchor never merge into it, even if they're close to a
  // LATER member of that cluster — an honest boundary, not a bug.
  const withEvents = Object.entries(eventBySymbol)
    .map(([symbol, e]) => ({ symbol, ...e, marketValue: Number(posList.find((p) => p.symbol === symbol)?.marketValue) || 0 }))
    .sort((a, b) => a.dte - b.dte);

  const clusters = [];
  const used = new Set();
  for (const anchor of withEvents) {
    if (used.has(anchor.symbol)) continue;
    const group = withEvents.filter((e) => !used.has(e.symbol) && e.dte - anchor.dte <= CLUSTER_WINDOW_DAYS);
    if (group.length < 2) continue; // a lone imminent event isn't a "concentration"
    group.forEach((e) => used.add(e.symbol));
    const exposureValue = group.reduce((s, e) => s + e.marketValue, 0);
    const exposurePct = totalPortfolioValue > 0 ? Math.round((exposureValue / totalPortfolioValue) * 1000) / 10 : 0;
    const level = classifyConcentration(exposurePct, group.length);
    clusters.push({
      positions: group.map((e) => e.symbol),
      eventDates: group.map((e) => ({ symbol: e.symbol, date: e.date, dte: e.dte })),
      exposureValue: Math.round(exposureValue * 100) / 100,
      exposurePct,
      concentrationLevel: level,
      recommendedAction: recommendedAction(level),
      newEntriesReduced: level === "HIGH" || level === "MODERATE",
      newEntriesBlocked: false, // advisory only in this pass — see file header
    });
  }

  return {
    engineVersion: CONCENTRATION_VERSION,
    clusters,
    totalPortfolioValue: Math.round(totalPortfolioValue * 100) / 100,
    windowDays: CLUSTER_WINDOW_DAYS,
    generatedAt: new Date(nowMs).toISOString(),
  };
}

module.exports = { computePortfolioEventConcentration, classifyConcentration, recommendedAction, CLUSTER_WINDOW_DAYS, CONCENTRATION_VERSION };
