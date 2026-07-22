// Canonical sector/theme classification — single source of truth.
//
// Before this file, three separate, inconsistent tables existed:
// advisor-ai.js's SECTOR_ETFS (11 GICS ETFs, no per-stock mapping),
// routes/market.js's SECTORS (11 ETFs + 5 top constituents each, used by
// /api/market/distribution), and risk-guardrails.js's SECTORS (a true
// ~45-symbol symbol->sector map used for position-concentration checks).
// None of the three could answer "what theme is this stock" the way the
// X Intelligence Engine needs (AI/Crypto/Energy/Defense/Healthcare/
// Semiconductors/Financials/Industrials), and none included Defense at all.
//
// This file replaces all three call sites (advisor-ai.js, routes/market.js,
// risk-guardrails.js import from here now) without changing their existing
// exported function names/shapes, so nothing that already depends on them
// (e.g. x-intel-ai.js's `sectorOf` import) breaks.

// 11 real GICS sector ETFs with their top-5 real constituents (per
// routes/market.js's richer pre-existing version — kept as the canonical
// icon/name/stocks source).
const SECTOR_ETFS = [
  { sym: "XLK",  name: "Technology",        icon: "💻", stocks: ["NVDA","MSFT","AAPL","AMD","AVGO"] },
  { sym: "XLF",  name: "Financials",        icon: "🏦", stocks: ["JPM","BAC","GS","MS","WFC"] },
  { sym: "XLV",  name: "Health Care",       icon: "🏥", stocks: ["UNH","JNJ","LLY","ABBV","MRK"] },
  { sym: "XLE",  name: "Energy",            icon: "⚡", stocks: ["XOM","CVX","COP","EOG","SLB"] },
  { sym: "XLI",  name: "Industrials",       icon: "🏭", stocks: ["GE","CAT","RTX","HON","UNP"] },
  { sym: "XLY",  name: "Cons. Discretionary", icon: "🛍", stocks: ["AMZN","TSLA","HD","MCD","NKE"] },
  { sym: "XLP",  name: "Cons. Staples",     icon: "🛒", stocks: ["PG","KO","PEP","WMT","COST"] },
  { sym: "XLU",  name: "Utilities",         icon: "💡", stocks: ["NEE","DUK","SO","AEP","EXC"] },
  { sym: "XLRE", name: "Real Estate",       icon: "🏠", stocks: ["AMT","PLD","EQIX","SPG","PSA"] },
  { sym: "XLB",  name: "Materials",         icon: "⛏", stocks: ["LIN","SHW","APD","ECL","NEM"] },
  { sym: "XLC",  name: "Comm. Services",    icon: "📡", stocks: ["META","GOOGL","NFLX","DIS","T"] },
];

// Fine-grained symbol -> sector-tag map (superset of risk-guardrails.js's
// original ~45-symbol table), extended with a real "defense" tag — the one
// theme genuinely missing from every existing table in this codebase.
const SYMBOL_SECTOR = {
  NVDA:"semi", AMD:"semi", AVGO:"semi", MU:"semi", QCOM:"semi", ANET:"semi", MRVL:"semi", SMCI:"semi", ARM:"semi", TXN:"semi", LRCX:"semi",
  MSFT:"software", ORCL:"software", CRM:"software", ADBE:"software", NOW:"software", PANW:"software", CRWD:"software", PLTR:"software", SNOW:"software", INTU:"software",
  AAPL:"tech-hw", AMZN:"internet", META:"internet", GOOGL:"internet", NFLX:"internet", UBER:"internet", ABNB:"internet", SHOP:"internet", COIN:"crypto", TSLA:"auto",
  LLY:"health", UNH:"health", JNJ:"health", ABBV:"health", MRK:"health",
  V:"fintech", MA:"fintech", AXP:"fintech", JPM:"bank", BAC:"bank", GS:"bank", MS:"bank", WFC:"bank",
  COST:"retail", WMT:"retail", HD:"retail", NKE:"retail", MCD:"retail", PEP:"staples", KO:"staples", PG:"staples",
  XOM:"energy", CVX:"energy", COP:"energy", EOG:"energy", SLB:"energy",
  GE:"industrial", CAT:"industrial", HON:"industrial", UNP:"industrial", DIS:"media", T:"media",
  NEE:"utility", DUK:"utility", SO:"utility", AEP:"utility", EXC:"utility",
  AMT:"real-estate", PLD:"real-estate", EQIX:"real-estate", SPG:"real-estate", PSA:"real-estate",
  LIN:"materials", SHW:"materials", APD:"materials", ECL:"materials", NEM:"materials",
  // Defense — genuinely missing from every prior table in this codebase.
  // RTX/BA were previously mislabeled "industrial" in risk-guardrails.js;
  // they're real defense primes and belong here instead.
  LMT:"defense", RTX:"defense", NOC:"defense", GD:"defense", LHX:"defense", BA:"defense",
};
function sectorOf(symbol) { return SYMBOL_SECTOR[symbol] || "other"; }

// Fine-grained sector tag -> the real GICS ETF it rolls up into. Used to
// cross-reference a per-stock sector tag against sector-level ETF price
// action (e.g. "is this NVDA divergence also showing up in XLK today").
const SECTOR_TO_ETF = {
  semi: "XLK", software: "XLK", "tech-hw": "XLK",
  internet: "XLC", media: "XLC",
  fintech: "XLF", bank: "XLF",
  health: "XLV",
  energy: "XLE",
  industrial: "XLI", defense: "XLI", // GICS classifies defense primes under Industrials — no separate defense ETF sector exists
  auto: "XLY", retail: "XLY",
  staples: "XLP",
  utility: "XLU",
  "real-estate": "XLRE",
  materials: "XLB",
  crypto: null, // no real equity-sector ETF for crypto; BTC/IBIT are tracked separately as a macro asset class, not a GICS sector
};
function etfOf(symbol) { return SECTOR_TO_ETF[sectorOf(symbol)] || null; }

// The 8 named themes from the X Intelligence Engine spec. A sector tag can
// map to zero, one, or two themes — real GICS sectors don't map 1:1 onto
// spec-style investing "themes" (e.g. semiconductor names ARE the AI trade
// in practice, so "semi" reasonably tags both Semiconductors and AI; retail/
// staples/media/real-estate/materials/utility/auto genuinely don't fit any
// of the 8 named themes and are left theme-less rather than force-fit).
const SECTOR_TO_THEMES = {
  semi: ["Semiconductors", "AI"],
  software: ["AI"],
  crypto: ["Crypto"],
  health: ["Healthcare"],
  fintech: ["Financials"], bank: ["Financials"],
  energy: ["Energy"],
  industrial: ["Industrials"],
  defense: ["Defense"],
};
function themesOf(symbol) { return SECTOR_TO_THEMES[sectorOf(symbol)] || []; }

module.exports = { SECTOR_ETFS, SYMBOL_SECTOR, sectorOf, SECTOR_TO_ETF, etfOf, SECTOR_TO_THEMES, themesOf };
