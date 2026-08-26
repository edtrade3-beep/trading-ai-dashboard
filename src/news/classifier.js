// src/news/classifier.js — deterministic catalyst taxonomy (spec §4).
// Starter set of the highest-signal real categories from the spec's full
// 29 — extensible rule table, not a hardcoded switch, so adding the rest
// later is additive. Same "keyword rules, no AI call" discipline as this
// app's existing classifiers (src/premarket-engine.js's scoreCatalyst,
// src/routes/market.js's classifyMacroHeadline).
"use strict";

// Order matters — checked top to bottom, first real match wins. More
// specific/high-conviction categories are listed before generic ones so a
// headline mentioning both (e.g. "FDA approval boosts price target") lands
// on the more decision-relevant tag (FDA), not the weaker one.
//
// SYSTEMIC_RISK / GEOPOLITICAL / MACRO sit at the very top (2026-08-26,
// explicit user request: "make sure system platform detect big/major news
// that change market regime/change narrative"). Real finding before this
// change: MACRO carried weight 50 — lower than PRODUCT/PARTNERSHIP (55) and
// barely above INSIDER (40) — and had no war/sanctions/banking-crisis
// vocabulary at all, so a genuine regime-shifting headline (a surprise Fed
// move, a bank failure, a war escalation) scored WORSE than a routine
// product launch and could never clear the impact-score bar /majornews and
// the new regime-alert use. All keywords below are multi-word phrases (not
// bare words like "war" or "bank") to avoid false-positive substring
// matches against unrelated financial vocabulary ("reward", "bankable",
// "warranty", etc.) — same discipline the existing AI rule already used.
const CATALYST_RULES = [
  { category: "SYSTEMIC_RISK", weight: 92, keywords: ["bank failure", "bank collapse", "banking crisis", "bank run", "run on the bank", "credit event", "sovereign default", "debt default", "bailout", "financial contagion", "banking contagion", "liquidity crisis", "systemic risk", "fdic takes over", "emergency lending facility", "bank seized", "deposit run", "too big to fail"] },
  { category: "GEOPOLITICAL", weight: 88, keywords: ["declares war", "at war with", "invasion of", "invades ukraine", "invades taiwan", "military strike", "airstrike", "missile strike", "missile attack", "ceasefire", "escalates conflict", "geopolitical tension", "geopolitical risk", "geopolitical crisis", "imposes sanctions", "new sanctions on", "sanctions on russia", "sanctions on china", "sanctions on iran", "opec cuts production", "opec production cut", "oil embargo", "nuclear threat", "coup in", "state of emergency", "martial law"] },
  { category: "MACRO", weight: 88, keywords: ["federal reserve", "fed rate", "fed chair", "interest rate decision", "emergency rate", "surprise rate", "rate hike", "rate cut", "inflation data", "hot inflation", "cpi report", "cpi data", "core cpi", "pce report", "pce data", "ppi report", "fomc", "jobs report", "nonfarm payrolls", "jobless claims", "unemployment rate", "gdp report", "gdp data", "recession fears", "recession risk", "yield curve", "treasury yields", "debt ceiling", "government shutdown", "trade war", "tariffs on", "central bank", "ecb rate", "boj rate", "quantitative easing", "quantitative tightening"] },
  { category: "M&A", weight: 90, keywords: ["acquisition", "to be acquired", "acquires", "acquiring", "merger", "buyout", "takeover bid", "to merge with"] },
  { category: "FDA", weight: 85, keywords: ["fda", "clinical trial", "phase 3 trial", "phase 2 trial", "phase 1 trial", "drug approval", "breakthrough therapy designation"] },
  { category: "EARNINGS", weight: 85, keywords: ["quarterly results", "quarterly earnings", "reports earnings", "reports q1 earnings", "reports q2 earnings", "reports q3 earnings", "reports q4 earnings", "earnings report", "earnings results", "posts earnings", "eps of", "eps estimates", "beats eps", "misses eps", "beats earnings estimates", "misses earnings estimates", "q1 results", "q2 results", "q3 results", "q4 results"] },
  { category: "GUIDANCE", weight: 80, keywords: ["guidance", "raises forecast", "cuts forecast", "lowers outlook", "raises outlook", "full-year outlook"] },
  { category: "SEC", weight: 75, keywords: ["sec investigation", "sec probe", "securities and exchange commission", "sec subpoena", "sec filing reveals"] },
  { category: "CONTRACT", weight: 65, keywords: ["wins contract", "awarded contract", "signs deal", "multi-year deal", "wins deal"] },
  { category: "ANALYST_UPGRADE", weight: 60, keywords: ["upgrades", "upgraded to buy", "upgraded to outperform", "initiates buy", "initiates outperform", "raises rating"] },
  { category: "ANALYST_DOWNGRADE", weight: 60, keywords: ["downgrades", "downgraded to sell", "downgraded to underperform", "initiates sell", "initiates underperform", "cuts rating"] },
  { category: "LEGAL", weight: 60, keywords: ["lawsuit", "sues", "class action", "litigation", "settlement reached"] },
  { category: "AI", weight: 60, keywords: ["artificial intelligence", "generative ai", "ai chip", "ai model", "ai partnership", "ai infrastructure"] },
  { category: "PRODUCT", weight: 55, keywords: ["unveils", "launches new", "product launch", "announces new product"] },
  { category: "PARTNERSHIP", weight: 55, keywords: ["partnership with", "partners with", "joint venture", "strategic alliance", "collaboration with"] },
  { category: "PRICE_TARGET", weight: 45, keywords: ["price target", "raises price target", "lowers price target", "pt raised", "pt lowered"] },
  { category: "INSIDER", weight: 40, keywords: ["insider buying", "insider selling", "insider bought shares", "insider sold shares", "form 4 filing"] },
];

function classifyCatalyst(item) {
  const text = `${item.headline || ""} ${item.summary || ""}`.toLowerCase();
  for (const rule of CATALYST_RULES) {
    if (rule.keywords.some((k) => text.includes(k))) {
      return { category: rule.category, catalystWeight: rule.weight, reasons: [`Matched a real "${rule.category}" keyword.`] };
    }
  }
  return { category: "OTHER", catalystWeight: 30, reasons: ["No specific catalyst keyword matched."] };
}

module.exports = { classifyCatalyst, CATALYST_RULES };
