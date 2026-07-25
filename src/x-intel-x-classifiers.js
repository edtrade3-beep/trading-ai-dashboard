// x-intel-x-classifiers.js — real, deterministic (zero-AI-cost) parsing of
// raw X post text. Not a replacement for what Claude's interpretation
// layer did (sentiment/impact/executive-summary judgment) — that's
// genuinely gone now that Anthropic is removed from X Intelligence Engine,
// disclosed honestly rather than faked with keyword-matching pretending to
// be AI-quality judgment. What IS real and worth building: two things raw
// X posts make possible that the old RSS-only free path never could,
// because RSS press releases don't carry cashtags or the same density of
// real market keywords.
const { SYMBOL_SECTOR } = require("./sector-theme-map");
const { CATEGORIES } = require("./x-intel-categories");

// Real cashtag extraction — parses $TICKER patterns literally present in
// the post text, cross-checked against the real known-symbol universe
// (sector-theme-map.js) to reject false positives like "$5" or "$AI" (not
// a real ticker in that map) rather than accepting any $-prefixed token.
// A symbol not in the known universe is dropped, not guessed into being
// real — same "never fabricate" discipline as everywhere else in this app.
function extractCashtags(text) {
  if (!text) return [];
  const matches = String(text).match(/\$([A-Z]{1,5})\b/g) || [];
  const symbols = [...new Set(matches.map((m) => m.slice(1)))];
  return symbols.filter((s) => SYMBOL_SECTOR[s] !== undefined);
}

// Real keyword classification against the existing category taxonomy —
// disclosed as pattern-matching, not AI judgment. First matching category
// wins; order matters (more specific categories checked before generic
// ones like "Macro"/"Other"). "Breaking News" checked first — literal
// wire-style urgency framing, not a catch-all; a real Fed rate decision
// still resolves to FederalReserve unless it's also headlined as breaking.
const CATEGORY_KEYWORDS = [
  ["Breaking News", [/\bbreaking:/i, /\bbreaking news\b/i, /^breaking\b/i, /\bjust in\b/i]],
  ["FederalReserve", [/\bfed\b/i, /federal reserve/i, /\bfomc\b/i, /powell/i, /interest rate decision/i]],
  ["InterestRates", [/rate (hike|cut|decision)/i, /basis points/i, /\bbps\b/i]],
  ["Inflation", [/inflation/i, /\bcpi\b/i, /\bppi\b/i, /consumer price/i]],
  ["Tariffs", [/tariff/i, /trade war/i, /trade deal/i]],
  ["Politics", [/white house/i, /president/i, /congress/i, /senate/i, /executive order/i]],
  ["Earnings", [/earnings/i, /\beps\b/i, /quarterly results/i, /guidance/i, /beat estimates/i, /missed estimates/i]],
  ["Acquisition", [/acqui(re|sition)/i, /merger/i, /\bm&a\b/i, /buyout/i, /takeover/i]],
  ["BankFailure", [/bank (failure|collapse|run)/i, /fdic/i, /insolvent/i]],
  ["CreditDowngrade", [/credit downgrade/i, /rating (cut|downgrade)/i, /moody'?s/i, /s&p downgrade/i]],
  ["Hack", [/\bhack(ed|er)?\b/i, /breach/i, /ransomware/i, /cyberattack/i]],
  ["ExchangeOutage", [/exchange outage/i, /trading halt/i, /system down/i]],
  ["CEOResignation", [/ceo (resign|step(s)? down|out)/i, /steps down as ceo/i]],
  ["Crypto", [/bitcoin/i, /crypto/i, /ethereum/i, /\bbtc\b/i, /\beth\b/i]],
  ["AI", [/\bai\b/i, /artificial intelligence/i, /machine learning/i, /\bllm\b/i]],
  ["Semiconductor", [/semiconductor/i, /\bchip(s)?\b/i, /\bfab\b/i, /foundry/i]],
  ["Healthcare", [/\bfda\b/i, /drug approval/i, /clinical trial/i, /healthcare/i]],
  ["Energy", [/\boil\b/i, /\bopec\b/i, /energy prices/i, /natural gas/i]],
  ["Consumer", [/consumer spending/i, /retail sales/i]],
];
function classifyCategory(text) {
  if (!text) return "Other";
  for (const [category, patterns] of CATEGORY_KEYWORDS) {
    if (patterns.some((p) => p.test(text))) return category;
  }
  return CATEGORIES.includes("Macro") && /\b(gdp|economy|economic|recession)\b/i.test(text) ? "Macro" : "Other";
}

// Real per-CATEGORY severity tier — based on how often this kind of news
// actually moves a stock/market same-day, not on who posted it. Fixes a
// confirmed live bug: urgency was hardcoded "low" for every single item
// regardless of content (an SEC enforcement-director departure showed
// identically "low" as a routine corporate blog post).
const CATEGORY_SEVERITY = {
  "Breaking News": "high", BankFailure: "high", CreditDowngrade: "high", Hack: "high",
  ExchangeOutage: "high", CEOResignation: "high", FederalReserve: "high",
  Earnings: "medium", Acquisition: "medium", InterestRates: "medium", Inflation: "medium",
  Tariffs: "medium", Politics: "medium", Crypto: "medium",
  AI: "low", Semiconductor: "low", Healthcare: "low", Energy: "low", Consumer: "low",
  Macro: "low", Other: "low",
};
function classifyUrgency(category) {
  return CATEGORY_SEVERITY[category] || "low";
}

// Real base importance per category — same severity reasoning as urgency
// above, on a 0-100 scale for blending with the watched entity's own score.
const CATEGORY_IMPORTANCE_BASE = {
  "Breaking News": 95, BankFailure: 95, CreditDowngrade: 90, Hack: 88, ExchangeOutage: 90,
  CEOResignation: 92, FederalReserve: 95, Earnings: 85, Acquisition: 80, InterestRates: 85,
  Inflation: 82, Tariffs: 78, Politics: 70, Crypto: 60,
  AI: 45, Semiconductor: 45, Healthcare: 45, Energy: 50, Consumer: 45, Macro: 55, Other: 35,
};
// Real per-item importance — blends WHAT the news is (category severity,
// the dominant 65% weight) with WHO said it (the watched entity's own base
// importance, a real but secondary 35% weight). Fixes a confirmed live
// bug: every item from a given entity showed the exact same maxed-out
// score (e.g. every OpenAI item at 90) regardless of whether it was a
// major announcement or a routine community-relations blog post — the
// entity's static score was being displayed AS IF it measured this
// specific item's significance, when it never did.
function computeItemImportance(entityImportanceScore, category) {
  const catBase = CATEGORY_IMPORTANCE_BASE[category] ?? 40;
  const entityScore = Number(entityImportanceScore) || 50;
  return Math.round(catBase * 0.65 + entityScore * 0.35);
}

// Real, deterministic bullish/bearish keyword lexicon — replaces the
// Anthropic sentiment call (2026-07-25, explicit user request: no
// Anthropic API for X Intel at all, not even the small Haiku sentiment
// classification). Same honest discipline as classifyCategory above:
// disclosed as pattern-matching, not AI judgment — never claims to be a
// calibrated probability or real interpretation. Zero cost, zero API
// dependency, zero rate-limit risk — can always run, unlike the old path
// which silently fell back to "unanalyzed" the moment Anthropic's account-
// level usage cap was hit (which is exactly what triggered this change).
const BULLISH_PATTERNS = [
  /beats? (estimates|expectations|forecast)/i, /exceeds? expectations/i, /record (revenue|profit|earnings)/i,
  /raises? (guidance|forecast)/i, /strong demand/i, /\bsurges?\b/i, /\brallies?\b/i, /\bsoars?\b/i,
  /\bjumps?\b/i, /upgrad(e|ed|es|ing)/i, /buy rating/i, /\boutperform/i, /share (buyback|repurchase)/i,
  /wins? (contract|deal)/i, /strong quarter/i, /tops? forecast/i, /(approval granted|granted approval)/i,
  /expands? (into|operations)/i,
];
const BEARISH_PATTERNS = [
  /misses? (estimates|expectations|forecast)/i, /falls? short/i, /(cuts?|lowers?) (guidance|forecast)/i,
  /weak demand/i, /\bplunges?\b/i, /\btumbles?\b/i, /\bslides?\b/i, /\bsinks?\b/i,
  /downgrad(e|ed|es|ing)/i, /sell rating/i, /\bunderperform/i, /\brecall(s|ed|ing)?\b/i, /\blawsuit/i,
  /\binvestigation\b/i, /\bresigns?\b/i, /steps? down/i, /\bbankruptcy\b/i, /\blayoffs?\b/i, /job cuts/i,
  /\bwarns?\b/i, /disappointing/i, /losses? widen/i,
];
function classifySentimentDeterministic(text) {
  const clean = String(text || "").trim();
  if (!clean) return { sentiment: "neutral", confidence: null, analyzed: false, source: "keyword" };
  const bullCount = BULLISH_PATTERNS.filter((p) => p.test(clean)).length;
  const bearCount = BEARISH_PATTERNS.filter((p) => p.test(clean)).length;
  if (bullCount === 0 && bearCount === 0) return { sentiment: "neutral", confidence: null, analyzed: true, source: "keyword" };
  const sentiment = bullCount > bearCount ? "bullish" : bearCount > bullCount ? "bearish" : "neutral";
  // Confidence is an honest proxy for keyword-match strength, not a
  // calibrated probability — capped at 70 (never claims AI-level certainty)
  // and null whenever the signal itself is a tie/neutral.
  const netMatches = Math.abs(bullCount - bearCount);
  const confidence = sentiment === "neutral" ? null : Math.min(70, 40 + netMatches * 15);
  return { sentiment, confidence, analyzed: true, source: "keyword" };
}

module.exports = { extractCashtags, classifyCategory, classifyUrgency, computeItemImportance, classifySentimentDeterministic };
