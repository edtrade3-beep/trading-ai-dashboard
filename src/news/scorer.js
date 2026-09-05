// src/news/scorer.js — 0-100 News Impact Score (spec §6). Real, computable
// inputs only: catalyst significance (from the classifier's own weight),
// freshness (real publishedAt age decay), source credibility (a small real
// static table), sentiment intensity, and real price/volume confirmation.
//
// Two of the spec's requested inputs — "surprise vs. expectations" and
// "whether already priced in" — have no real dataset behind them anywhere
// in this app (no earnings-consensus/estimates feed, no options-positioning
// feed wired to this pipeline). Rather than fabricate either, they are
// simply NOT separate weighted slots here; the 5 real components below sum
// to the full 100%. Same "honest mid-point/never fabricated" discipline as
// every other composite score in this codebase.
"use strict";

const { etfOf } = require("../sector-theme-map");

const WEIGHTS = { catalyst: 0.35, freshness: 0.20, source: 0.15, sentiment: 0.15, confirmation: 0.15 };

// Multi-asset verdict (News Intelligence Engine V1, 2026-09-05, spec
// §10/11 — "do NOT assign one universal bullish/bearish verdict"). A
// small, real per-asset directional read derived from the item's own
// already-computed sentiment tier and its confirmation's divergence
// flag (confirmation.js's detectNewsDivergence) — no new quote fetch, no
// second scoring formula. Broad "MARKET"-tagged items (no real single
// ticker) skip the ticker/sector-ETF rows and report SPY/QQQ only.
function computeAssetImpact({ ticker, sentiment, confirmation }) {
  const bullish = sentiment === "BULLISH" || sentiment === "STRONGLY_BULLISH";
  const bearish = sentiment === "BEARISH" || sentiment === "STRONGLY_BEARISH";
  const direction = bullish ? "BULLISH" : bearish ? "BEARISH" : "NEUTRAL";
  const diverged = confirmation && confirmation.divergence === "NEWS_PRICE_DIVERGENCE";
  const marketDirection = diverged ? "MIXED" : direction;
  const marketNote = diverged ? "Real price action (SPY/QQQ) diverges from this headline's sentiment read — see divergenceReason." : null;

  const assets = [];
  if (ticker && ticker !== "MARKET") {
    assets.push({ symbol: ticker, direction, note: null });
    const etf = etfOf(ticker);
    if (etf) assets.push({ symbol: etf, direction, note: `Sector proxy for ${ticker}.` });
  }
  assets.push({ symbol: "SPY", direction: marketDirection, note: marketNote });
  assets.push({ symbol: "QQQ", direction: marketDirection, note: marketNote });
  return assets;
}

// Small, real, static credibility table — not a claim about editorial
// quality, just a rough real-world reach/reliability ranking used
// consistently across every item scored.
const SOURCE_CREDIBILITY = {
  reuters: 95, bloomberg: 95, "associated press": 92, ap: 92, "wall street journal": 92, wsj: 92,
  cnbc: 85, barrons: 82, "the wall street journal": 92, marketwatch: 78, finnhub: 75, polygon: 75,
  "yahoo finance": 65, "business wire": 70, "pr newswire": 68, "globe newswire": 68,
};
function sourceCredibility(source) {
  const key = String(source || "").toLowerCase().trim();
  if (SOURCE_CREDIBILITY[key] != null) return SOURCE_CREDIBILITY[key];
  for (const [k, v] of Object.entries(SOURCE_CREDIBILITY)) if (key.includes(k)) return v;
  return 55; // honest mid-point for an unrecognized source — not a penalty, not a guess at quality
}

function freshnessScore(publishedAt) {
  if (!publishedAt) return 50; // honest mid-point — real headline, unknown age
  const ms = Date.now() - new Date(publishedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 50;
  const mins = ms / 60000;
  if (mins <= 15) return 100;
  if (mins <= 60) return 90;
  if (mins <= 240) return 70;
  if (mins <= 1440) return 45;
  return 20;
}

function sentimentIntensity(tier) {
  if (tier === "STRONGLY_BULLISH" || tier === "STRONGLY_BEARISH") return 100;
  if (tier === "BULLISH" || tier === "BEARISH") return 70;
  return 30; // NEUTRAL — a real catalyst can still matter with muted sentiment, honest mid-low, not zero
}

function confirmationScore(confirmation) {
  if (!confirmation || !confirmation.available) return 50; // honest mid-point, not fabricated
  if (confirmation.confirmed === true) return 95;
  if (confirmation.confirmed === false) return 30;
  return 50; // neutral sentiment had nothing to confirm against
}

function impactClassification(score) {
  if (score >= 90) return "EXTREME";
  if (score >= 80) return "HIGH";
  if (score >= 70) return "SIGNIFICANT";
  if (score >= 60) return "MODERATE";
  return "LOW";
}

/**
 * @param {{catalystWeight:number, source:string, publishedAt:string|null, sentiment:string}} item
 * @param {object|null} confirmation
 */
function computeImpactScore(item, confirmation) {
  const fresh = freshnessScore(item.publishedAt);
  const src = sourceCredibility(item.source);
  const sentInt = sentimentIntensity(item.sentiment);
  const conf = confirmationScore(confirmation);
  const catalyst = Number.isFinite(item.catalystWeight) ? item.catalystWeight : 30;

  const score = Math.round(
    catalyst * WEIGHTS.catalyst +
    fresh * WEIGHTS.freshness +
    src * WEIGHTS.source +
    sentInt * WEIGHTS.sentiment +
    conf * WEIGHTS.confirmation
  );
  const clamped = Math.max(0, Math.min(100, score));

  return {
    impactScore: clamped,
    freshnessScore: fresh,
    classification: impactClassification(clamped),
    breakdown: { catalyst, freshness: fresh, source: src, sentiment: sentInt, confirmation: conf },
    reasons: [
      `Catalyst weight ${catalyst}/100, freshness ${fresh}/100, source credibility ${src}/100, sentiment intensity ${sentInt}/100${confirmation && confirmation.available ? `, confirmation ${conf}/100` : ", confirmation unavailable (honest mid-point)"}.`,
      "Surprise-vs-expectations and already-priced-in are not scored — no real consensus/positioning dataset exists in this app to compute them honestly.",
    ],
  };
}

// News Verdict (spec §9) + separate News Signal (spec §13) — never "BUY
// NOW" off a headline alone. Verdict blends sentiment + confirmation +
// impact; Signal is deliberately kept as its own field, never folded into
// the actual BUY/SELL decision the rest of this app already owns.
function deriveVerdict({ sentiment, impactScore, confirmation }) {
  const bullish = sentiment === "BULLISH" || sentiment === "STRONGLY_BULLISH";
  const bearish = sentiment === "BEARISH" || sentiment === "STRONGLY_BEARISH";
  const confirmed = confirmation && confirmation.available ? confirmation.confirmed : null;

  if (bullish && confirmed === true && impactScore >= 80) return "STRONG_BULLISH_CONFIRMATION";
  if (bullish && confirmed === true) return "BULLISH_CATALYST";
  if (bearish && confirmed === true && impactScore >= 80) return "HIGH_RISK";
  if (bearish && confirmed === true) return "BEARISH_CATALYST";
  if ((bullish || bearish) && confirmed === false) return "CONFLICTING_SIGNAL";
  if ((bullish || bearish) && confirmed === null) return "WAIT_FOR_CONFIRMATION";
  return "WATCH";
}

function deriveNewsSignal({ sentiment, confirmation }) {
  if (sentiment == null) return "NO_MATERIAL_NEWS";
  const bullish = sentiment === "BULLISH" || sentiment === "STRONGLY_BULLISH";
  const bearish = sentiment === "BEARISH" || sentiment === "STRONGLY_BEARISH";
  const confirmed = confirmation && confirmation.available ? confirmation.confirmed : null;

  if (bearish) return "NEGATIVE";
  if (bullish && confirmed === true) return "CONFIRMED";
  if (bullish && confirmed === false) return "CONFLICTING";
  if (bullish && confirmed === null) return "UNCONFIRMED";
  return "DEVELOPING";
}

module.exports = { computeImpactScore, freshnessScore, sourceCredibility, impactClassification, deriveVerdict, deriveNewsSignal, computeAssetImpact };
