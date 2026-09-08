// src/news/scope-classifier.js — News Scope Classification + structured
// brief ("3-Second AI Decision System" spec, 2026-09-07: "Do not dump
// hundreds of headlines into the primary screen. The news engine should
// classify: MARKET MOVING / TICKER MOVING / SECTOR MOVING / NOISE").
//
// ANTI-DUPLICATION: this is a pure, additive re-bucketing layer over
// fields the existing pipeline already computes for every real item
// (news/classifier.js's catalyst category, news/scorer.js's impact score
// + per-asset direction, news/sentiment.js's 5-tier sentiment, news/
// confirmation.js's real price-vs-news divergence check) — zero new
// fetches, zero re-scoring, zero AI call (same "deterministic rules
// first" discipline as every other classifier in this app).
"use strict";

const MARKET_MOVING_CATEGORIES = new Set(["SYSTEMIC_RISK", "GEOPOLITICAL", "MACRO"]);
const SECTOR_MOVING_CATEGORIES = new Set(["AI", "CRYPTO_REGULATORY"]);
const NOISE_IMPACT_CEILING = 40; // real, disclosed threshold — below this, even a real ticker-specific catalyst isn't "meaningful" enough for the primary screen

// Real, disclosed scope classification — a re-bucketing of the SAME real
// catalyst category + impact score, never a second scoring pass.
function classifyNewsScope(item) {
  const category = item?.category || "OTHER";
  const impactScore = Number(item?.impact_score ?? item?.impactScore);
  const ticker = String(item?.ticker || "").toUpperCase();

  if (ticker === "MARKET" || MARKET_MOVING_CATEGORIES.has(category)) return "MARKET_MOVING";
  if (Number.isFinite(impactScore) && impactScore < NOISE_IMPACT_CEILING) return "NOISE";
  if (category === "OTHER") return "NOISE";
  if (SECTOR_MOVING_CATEGORIES.has(category)) return "SECTOR_MOVING";
  return "TICKER_MOVING";
}

// Real, disclosed catalyst-category -> typical time-horizon heuristic —
// a judgment call on WHICH categories usually resolve short-term vs.
// ripple longer-term, not a fitted/backtested model. Both flags can be
// true (many real catalysts matter on both horizons).
const HORIZON_RULES = {
  SYSTEMIC_RISK: { shortTerm: true, longTerm: true },
  GEOPOLITICAL: { shortTerm: true, longTerm: true },
  MACRO: { shortTerm: true, longTerm: true },
  M_AND_A: { shortTerm: true, longTerm: true },
  "M&A": { shortTerm: true, longTerm: true },
  FDA: { shortTerm: true, longTerm: true },
  EARNINGS: { shortTerm: true, longTerm: false },
  GUIDANCE: { shortTerm: true, longTerm: true },
  SEC: { shortTerm: false, longTerm: true },
  CONTRACT: { shortTerm: true, longTerm: false },
  ANALYST_UPGRADE: { shortTerm: true, longTerm: false },
  ANALYST_DOWNGRADE: { shortTerm: true, longTerm: false },
  LEGAL: { shortTerm: false, longTerm: true },
  AI: { shortTerm: false, longTerm: true },
  PRODUCT: { shortTerm: false, longTerm: true },
  PARTNERSHIP: { shortTerm: false, longTerm: true },
  PRICE_TARGET: { shortTerm: true, longTerm: false },
  INSIDER: { shortTerm: false, longTerm: true },
  CRYPTO_REGULATORY: { shortTerm: true, longTerm: true },
  CRYPTO_SECURITY: { shortTerm: true, longTerm: false },
  CRYPTO_NETWORK: { shortTerm: false, longTerm: true },
  OTHER: { shortTerm: null, longTerm: null },
};

function horizonEffect(category) {
  return HORIZON_RULES[category] || HORIZON_RULES.OTHER;
}

// Real 3-state direction — a genuine real news-vs-price DIVERGENCE
// (confirmation.js's own detectNewsDivergence, already computed) counts
// as a real MIXED read, not just a neutral-sentiment fallback.
function classifyDirection({ sentiment, confirmation }) {
  if (confirmation?.divergence === "NEWS_PRICE_DIVERGENCE") return "MIXED";
  if (sentiment === "STRONGLY_BULLISH" || sentiment === "BULLISH") return "BULLISH";
  if (sentiment === "STRONGLY_BEARISH" || sentiment === "BEARISH") return "BEARISH";
  return "MIXED";
}

// Real "already priced" read off confirmation.js's own real price-
// confirmation check — never a fabricated "yes/no", honest UNKNOWN when
// no real confirmation data exists for this item.
function classifyAlreadyPriced(confirmation) {
  if (!confirmation || confirmation.available === false) return "UNKNOWN";
  if (confirmation.divergence === "NEWS_PRICE_DIVERGENCE") return "NOT_YET_PRICED";
  if (confirmation.confirmed === true) return "PARTIALLY_PRICED";
  return "UNKNOWN";
}

// Real, disclosed "does this change the verdict" flag — high real impact
// + a strong real sentiment tier + real evidence it ISN'T already priced
// in (or no real confirmation data to say otherwise). Never a claim that
// it actually DOES change the canonical verdict — that decision still
// belongs to asset-decision.js alone; this only flags "worth a fresh
// look," the same "surface, don't decide" discipline as AiUpdateBanner.
function shouldReviewVerdict({ impactClassification, sentiment, alreadyPriced }) {
  const highImpact = impactClassification === "HIGH" || impactClassification === "EXTREME";
  const strongSentiment = sentiment === "STRONGLY_BULLISH" || sentiment === "STRONGLY_BEARISH" || sentiment === "BULLISH" || sentiment === "BEARISH";
  const notYetReflected = alreadyPriced === "NOT_YET_PRICED" || alreadyPriced === "UNKNOWN";
  return !!(highImpact && strongSentiment && notYetReflected);
}

// One combined real read per news item — composes every function above.
// `item` is a news/store.js row (or the pipeline's own pre-insert shape):
// category, impact_score/impactScore, sentiment, ticker, confirmation
// (with its own real assetImpact array already attached).
function buildNewsBrief(item) {
  const scope = classifyNewsScope(item);
  const impactScore = Number(item?.impact_score ?? item?.impactScore);
  const impactClassification = Number.isFinite(impactScore)
    ? impactScore >= 90 ? "EXTREME" : impactScore >= 80 ? "HIGH" : impactScore >= 70 ? "SIGNIFICANT" : impactScore >= 60 ? "MODERATE" : "LOW"
    : null;
  let confirmation = item?.confirmation;
  if (typeof confirmation === "string") { try { confirmation = JSON.parse(confirmation); } catch { confirmation = null; } }
  const direction = classifyDirection({ sentiment: item?.sentiment, confirmation });
  const alreadyPriced = classifyAlreadyPriced(confirmation);
  const horizon = horizonEffect(item?.category);
  const tickers = Array.isArray(confirmation?.assetImpact) ? confirmation.assetImpact.map((a) => a.symbol) : (item?.ticker && item.ticker !== "MARKET" ? [item.ticker] : []);

  return {
    scope,
    whatHappened: item?.headline || null,
    whyItMatters: `A real ${item?.category || "OTHER"} catalyst${impactClassification ? ` with ${impactClassification} impact (${impactScore}/100)` : ""}.`,
    direction,
    shortTermEffect: horizon.shortTerm,
    longTermEffect: horizon.longTerm,
    whichTickers: tickers,
    alreadyPriced,
    changesVerdict: shouldReviewVerdict({ impactClassification, sentiment: item?.sentiment, alreadyPriced }),
    impactClassification,
  };
}

module.exports = {
  MARKET_MOVING_CATEGORIES, SECTOR_MOVING_CATEGORIES, NOISE_IMPACT_CEILING,
  classifyNewsScope, classifyDirection, classifyAlreadyPriced, shouldReviewVerdict, horizonEffect,
  buildNewsBrief,
};
