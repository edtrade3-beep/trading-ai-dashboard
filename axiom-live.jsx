import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// ═══════════════════════════════════════════════════════════════
// AXIOM — Professional Market Intelligence Platform
// Real Data Edition — multi-provider (Finnhub + FMP + Yahoo fallback)
// ═══════════════════════════════════════════════════════════════

const THEME_LIGHT = {
  bg: "#fbfcff",
  surface: "#ffffff",
  card: "#ffffff",
  cardHover: "#f6f9ff",
  border: "#e6edf7",
  borderLit: "#d6e3f5",
  text: "#0a0a0a",
  textSec: "#1f1f1f",
  textDim: "#262626",
  accent: "#2c76e7",
  accentGlow: "rgba(44,118,231,0.14)",
  green: "#17a572",
  greenBg: "rgba(23,165,114,0.10)",
  red: "#de5b6f",
  redBg: "rgba(222,91,111,0.10)",
  amber: "#d99a2c",
  amberBg: "rgba(217,154,44,0.10)",
  cyan: "#2f98c6",
  purple: "#9a6ae0",
};
const THEME_DARK = {
  bg: "#0b1220",
  surface: "#111a2d",
  card: "#131f35",
  cardHover: "#1a2942",
  border: "#223452",
  borderLit: "#2a4063",
  text: "#e8eefb",
  textSec: "#c5d2ea",
  textDim: "#93a7c8",
  accent: "#4a8dff",
  accentGlow: "rgba(74,141,255,0.20)",
  green: "#1fbd87",
  greenBg: "rgba(31,189,135,0.14)",
  red: "#ef6f83",
  redBg: "rgba(239,111,131,0.14)",
  amber: "#e4ab45",
  amberBg: "rgba(228,171,69,0.16)",
  cyan: "#3fb1df",
  purple: "#b086ff",
};
const C = { ...THEME_LIGHT };

const SANS = `'Inter', 'Segoe UI Variable Text', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`;
const MONO = `'Inter', 'Segoe UI Variable Text', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`;
const UI_ZOOM = 1.06;
const LAYOUT = {
  pageMaxWidth: 1880,
  contentPadding: "18px 20px 28px",
  gridGap: 14,
  sidebarWidth: 390,
};
const WEATHER_ZIP = "45014";

const MARKET_BASE_URL = "/api/market";
const CANDLE_BASE_URL = "/api/yahoo";

// ── Symbols ──
const WATCHLIST_SYMBOLS = [
  "NVDA","AAPL","MSFT","AMZN","META","GOOGL","TSLA","JPM","XOM","UNH","LLY","AVGO","HD","V","CRM",
  "AMD","QCOM","MU","INTC","ORCL","ADBE","NFLX","COST","WMT","BAC","WFC","GS","MS","CAT","DE",
  "NKE","MCD","DIS","PFE","MRK","ABBV","KO","PEP","TMO","AMGN","ISRG","PANW","PLTR","UBER","SHOP"
];
const MARKET_UNIVERSE_SYMBOLS = [
  "AAPL","MSFT","NVDA","AMZN","META","GOOGL","TSLA","AVGO","BRK.B","JPM","V","UNH","XOM","LLY","MA","HD","PG","COST","JNJ","MRK",
  "ABBV","KO","PEP","BAC","WMT","ORCL","CRM","ADBE","NFLX","CSCO","AMD","QCOM","TMO","MCD","INTU","ACN","DHR","ABT","LIN","TXN",
  "NEE","PM","DIS","CAT","NKE","PFE","INTC","AMAT","GE","IBM","NOW","AMGN","SPGI","BKNG","GS","PLTR","MU","PANW","UBER","SHOP",
  "SNOW","CRWD","ANET","ADP","BLK","AXP","MS","CVX","COP","SLB","EOG","FANG","MPC","OXY","RTX","LMT","BA","DE","MMM","HON",
  "UPS","FDX","UNP","CSX","NSC","C","WFC","SCHW","BX","KKR","APO","PGR","AON","MMC","CMCSA","TMUS","T","VZ","SBUX","CMG",
  "LOW","TJX","TGT","ROST","DG","DLTR","CVS","CI","HUM","ISRG","SYK","BSX","GILD","VRTX","REGN","MDT","BMY","SO","DUK","D",
  "PLD","AMT","EQIX","PSA","CCI","SPG","O","WELL","VICI","NEM","FCX","NUE","X","CLF","DAL","UAL","AAL","RCL","CCL","MAR",
  "HLT","ABNB","PYPL","SQ","COIN","HOOD","RIOT","MARA","SMCI","ARM","ASML","TSM","NVO","SAP","BABA","PDD","JD","MELI","SE",
];
const LIVE_TV_SOURCES = [
  {
    id: "bloomberg",
    label: "Bloomberg TV",
    embed: "https://www.youtube.com/embed/live_stream?channel=UCIALMKvObZNtJ6AmdCLP7Lg",
    official: "https://www.bloomberg.com/live/us",
  },
  {
    id: "cnbc",
    label: "CNBC",
    embed: "https://www.youtube.com/embed/live_stream?channel=UCvJJ_dzjViJCoLf5uKUTwoA",
    official: "https://www.cnbc.com/live-tv/",
  },
  {
    id: "reuters",
    label: "Reuters",
    embed: "https://www.youtube.com/embed/live_stream?channel=UChqUTb7kYRX8-EiaN3XFrSQ",
    official: "https://www.reuters.com/world/",
  },
];
const MACRO_SYMBOLS = [
  { symbol: "SPY", label: "S&P 500", type: "etf" },
  { symbol: "QQQ", label: "Nasdaq 100", type: "etf" },
  { symbol: "IWM", label: "Russell 2000", type: "etf" },
  { symbol: "DIA", label: "Dow 30", type: "etf" },
  { symbol: "VIXY", label: "Volatility", type: "volatility" },
  { symbol: "GLD", label: "Gold", type: "commodity" },
  { symbol: "BNO", label: "Brent Oil (Proxy)", type: "commodity" },
  { symbol: "USO", label: "Crude Oil", type: "commodity" },
  { symbol: "SHY", label: "2Y Treasury (Proxy)", type: "bond" },
  { symbol: "IEF", label: "10Y Treasury (Proxy)", type: "bond" },
  { symbol: "TLT", label: "20Y Treasury", type: "bond" },
  { symbol: "HYG", label: "High Yield", type: "credit" },
  { symbol: "LQD", label: "IG Credit", type: "credit" },
  { symbol: "UUP", label: "US Dollar", type: "currency" },
  { symbol: "BTCUSD", label: "Bitcoin", type: "crypto" },
  { symbol: "ETHUSD", label: "Ethereum", type: "crypto" },
  { symbol: "SOLUSD", label: "Solana", type: "crypto" },
];
const SECTOR_ETFS = [
  { symbol: "XLK", name: "Technology" },
  { symbol: "XLV", name: "Healthcare" },
  { symbol: "XLF", name: "Financials" },
  { symbol: "XLY", name: "Consumer Disc" },
  { symbol: "XLC", name: "Communication" },
  { symbol: "XLI", name: "Industrials" },
  { symbol: "XLE", name: "Energy" },
  { symbol: "XLP", name: "Cons. Staples" },
  { symbol: "XLU", name: "Utilities" },
  { symbol: "XLRE", name: "Real Estate" },
  { symbol: "XLB", name: "Materials" },
];
const STOCK_TO_SECTOR = {
  NVDA: "XLK", AAPL: "XLK", MSFT: "XLK", AVGO: "XLK",
  AMZN: "XLY", TSLA: "XLY", HD: "XLY",
  META: "XLC", GOOGL: "XLC", CRM: "XLK",
  JPM: "XLF", XOM: "XLE", UNH: "XLV", LLY: "XLV", V: "XLF",
};
const TV_EXCHANGE_HINTS = {
  SPY: "AMEX", QQQ: "NASDAQ", IWM: "AMEX", DIA: "AMEX", GLD: "AMEX", TLT: "NASDAQ", USO: "AMEX",
  XLK: "AMEX", XLV: "AMEX", XLF: "AMEX", XLY: "AMEX", XLC: "AMEX", XLI: "AMEX", XLE: "AMEX",
  XLP: "AMEX", XLU: "AMEX", XLRE: "AMEX", XLB: "AMEX",
};
const STORAGE_KEY = "axiom_local_config_v1";
const APP_LOCK_PASSWORD = "@Dixie123";
const AUTH_STORAGE_KEY = "axiom_app_unlock_v1";
const DEFAULT_SETTINGS = {
  refreshMs: 180000,
  terminalLayout: "1",
  hotkeyProfile: "classic",
  themeMode: "light",
  econCalendarView: "today",
  econCalendarRegion: "US",
  econAutoRisk30m: true,
  providerKeys: { finnhubKey: "", fmpKey: "", polygonKey: "", uwKey: "", tradierKey: "" },
  flowFilters: { flowType: "all", minNotional: "0", unusualOnly: false, autoAlertNotional: "250000" },
};

function getMarketSessionET(now = new Date()) {
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const mins = et.getHours() * 60 + et.getMinutes();
  if (mins >= 240 && mins < 570) return "PREMARKET";
  if (mins >= 570 && mins < 960) return "REGULAR";
  if (mins >= 960 && mins < 1200) return "AFTERMARKET";
  return "OVERNIGHT";
}

function nextDayOfMonthOccurrence(day = 12, hour = 8, minute = 30, fromDate = new Date()) {
  const d = new Date(fromDate);
  d.setSeconds(0, 0);
  const year = d.getFullYear();
  const month = d.getMonth();
  const candidate = new Date(year, month, day, hour, minute, 0, 0);
  if (candidate > d) return candidate;
  return new Date(year, month + 1, day, hour, minute, 0, 0);
}

function nextFirstFridayOccurrence(hour = 8, minute = 30, fromDate = new Date()) {
  const d = new Date(fromDate);
  d.setSeconds(0, 0);
  let year = d.getFullYear();
  let month = d.getMonth();
  for (let k = 0; k < 14; k += 1) {
    const firstDay = new Date(year, month, 1);
    const dow = firstDay.getDay();
    const offset = (5 - dow + 7) % 7;
    const firstFridayDate = 1 + offset;
    const candidate = new Date(year, month, firstFridayDate, hour, minute, 0, 0);
    if (candidate > d) return candidate;
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000);
}

function nextFedCycleOccurrence(fromDate = new Date()) {
  const d = new Date(fromDate);
  d.setSeconds(0, 0);
  const anchor = new Date(2026, 0, 29, 14, 0, 0, 0);
  const stepMs = 42 * 24 * 60 * 60 * 1000;
  if (d < anchor) return anchor;
  const diff = d.getTime() - anchor.getTime();
  const jumps = Math.floor(diff / stepMs) + 1;
  return new Date(anchor.getTime() + jumps * stepMs);
}

function formatCountdown(ms) {
  const n = Math.max(0, Number(ms || 0));
  const totalSec = Math.floor(n / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function weatherCodeLabel(code) {
  const n = Number(code);
  if (n === 0) return "Clear";
  if ([1, 2, 3].includes(n)) return "Partly cloudy";
  if ([45, 48].includes(n)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(n)) return "Drizzle";
  if ([61, 63, 65, 66, 67].includes(n)) return "Rain";
  if ([71, 73, 75, 77].includes(n)) return "Snow";
  if ([80, 81, 82].includes(n)) return "Rain showers";
  if ([95, 96, 99].includes(n)) return "Thunderstorm";
  return "Mixed";
}

function buildMacroEventCalendar(now = new Date()) {
  const ref = new Date(now);
  const fed = nextFedCycleOccurrence(ref);
  const cpi = nextDayOfMonthOccurrence(12, 8, 30, ref);
  const jobs = nextFirstFridayOccurrence(8, 30, ref);
  const pce = nextDayOfMonthOccurrence(28, 8, 30, ref);
  const fomcMins = new Date(fed.getTime() + 21 * 24 * 60 * 60 * 1000);
  const ecb = nextDayOfMonthOccurrence(6, 8, 15, ref);
  const boe = nextDayOfMonthOccurrence(20, 7, 0, ref);
  const boj = nextDayOfMonthOccurrence(18, 23, 0, ref);
  const chinaCpi = nextDayOfMonthOccurrence(10, 21, 30, ref);

  const events = [
    { id: "fed", title: "Fed Decision / Presser", tag: "FED", severity: "high", time: fed, riskNote: "Reduce gross and avoid fresh size 60–90m pre-event.", estimated: true },
    { id: "cpi", title: "US CPI Release", tag: "CPI", severity: "high", time: cpi, riskNote: "Tighten stops and cut leverage into print.", estimated: true },
    { id: "jobs", title: "US Jobs (NFP)", tag: "JOBS", severity: "high", time: jobs, riskNote: "Expect index/FX vol spikes; reduce into event.", estimated: true },
    { id: "pce", title: "PCE Inflation", tag: "PCE", severity: "medium", time: pce, riskNote: "Trim high-beta if regime is fragile.", estimated: true },
    { id: "fomc-mins", title: "FOMC Minutes", tag: "MINUTES", severity: "medium", time: fomcMins, riskNote: "Keep optionality; avoid oversized adds.", estimated: true },
  ].map((e) => {
    const tteMs = e.time.getTime() - ref.getTime();
    const mins = tteMs / 60000;
    const phase = mins <= 0 ? "live" : mins <= 60 ? "imminent" : mins <= 180 ? "near" : "scheduled";
    return { ...e, tteMs, phase };
  });

  return events.sort((a, b) => a.time.getTime() - b.time.getTime());
}

function buildMacroEventCalendarV2(now = new Date()) {
  const ref = new Date(now);
  const fed = nextFedCycleOccurrence(ref);
  const cpi = nextDayOfMonthOccurrence(12, 8, 30, ref);
  const jobs = nextFirstFridayOccurrence(8, 30, ref);
  const pce = nextDayOfMonthOccurrence(28, 8, 30, ref);
  const fomcMins = new Date(fed.getTime() + 21 * 24 * 60 * 60 * 1000);
  const ecb = nextDayOfMonthOccurrence(6, 8, 15, ref);
  const boe = nextDayOfMonthOccurrence(20, 7, 0, ref);
  const boj = nextDayOfMonthOccurrence(18, 23, 0, ref);
  const chinaCpi = nextDayOfMonthOccurrence(10, 21, 30, ref);

  const events = [
    { id: "fed", title: "Fed Decision / Presser", tag: "FED", severity: "high", region: "US", time: fed, riskNote: "Reduce gross and avoid fresh size 60-90m pre-event.", estimated: true },
    { id: "cpi", title: "US CPI Release", tag: "CPI", severity: "high", region: "US", time: cpi, riskNote: "Tighten stops and cut leverage into print.", estimated: true },
    { id: "jobs", title: "US Jobs (NFP)", tag: "JOBS", severity: "high", region: "US", time: jobs, riskNote: "Expect index/FX vol spikes; reduce into event.", estimated: true },
    { id: "pce", title: "PCE Inflation", tag: "PCE", severity: "medium", region: "US", time: pce, riskNote: "Trim high-beta if regime is fragile.", estimated: true },
    { id: "fomc-mins", title: "FOMC Minutes", tag: "MINUTES", severity: "medium", region: "US", time: fomcMins, riskNote: "Keep optionality; avoid oversized adds.", estimated: true },
    { id: "ecb", title: "ECB Rate Decision", tag: "ECB", severity: "high", region: "GLOBAL", time: ecb, riskNote: "Watch DXY and global risk cross-asset reaction.", estimated: true },
    { id: "boe", title: "BoE Policy Decision", tag: "BOE", severity: "medium", region: "GLOBAL", time: boe, riskNote: "UK rates can spill into global yields/risk.", estimated: true },
    { id: "boj", title: "BoJ Policy Outlook", tag: "BOJ", severity: "medium", region: "GLOBAL", time: boj, riskNote: "JPY/yield shifts can hit equity beta quickly.", estimated: true },
    { id: "cn-cpi", title: "China CPI/PPI", tag: "CN CPI", severity: "medium", region: "GLOBAL", time: chinaCpi, riskNote: "Can affect commodity and cyclical sentiment.", estimated: true },
  ].map((e) => {
    const tteMs = e.time.getTime() - ref.getTime();
    const mins = tteMs / 60000;
    const phase = mins <= 0 ? "live" : mins <= 60 ? "imminent" : mins <= 180 ? "near" : "scheduled";
    const impact = e.severity === "high" ? "HIGH" : e.severity === "medium" ? "MEDIUM" : "LOW";
    return { ...e, tteMs, phase, impact };
  });

  return events.sort((a, b) => a.time.getTime() - b.time.getTime());
}

function analyzeNewsIntelligence(newsRows = []) {
  const byTicker = {};
  const upgrades = [];
  const downgrades = [];
  const macroRed = [];
  const macroGreen = [];
  const upWords = ["upgrade", "upgrades", "outperform", "overweight", "buy rating", "raises target", "initiates buy"];
  const downWords = ["downgrade", "downgrades", "underperform", "underweight", "sell rating", "cuts target", "reduces target"];
  const buyWords = ["buyback", "beats", "strong guidance", "raised guidance", "contract win"];
  const sellWords = ["misses", "cuts guidance", "secondary offering", "dilution", "investigation"];
  const redWords = ["war", "conflict", "sanction", "tariff", "rate hike", "hot inflation", "recession", "liquidity stress"];
  const greenWords = ["ceasefire", "rate cut", "cooling inflation", "stimulus", "disinflation", "soft landing"];

  for (const row of newsRows || []) {
    const text = `${row?.title || ""} ${row?.summary || ""}`.toLowerCase();
    const ticker = String(row?.ticker || "").toUpperCase();
    if (ticker && !byTicker[ticker]) byTicker[ticker] = { upgrades: 0, downgrades: 0, buyMentions: 0, sellMentions: 0 };
    if (ticker) {
      if (upWords.some((w) => text.includes(w))) byTicker[ticker].upgrades += 1;
      if (downWords.some((w) => text.includes(w))) byTicker[ticker].downgrades += 1;
      if (buyWords.some((w) => text.includes(w))) byTicker[ticker].buyMentions += 1;
      if (sellWords.some((w) => text.includes(w))) byTicker[ticker].sellMentions += 1;
      if (byTicker[ticker].upgrades > byTicker[ticker].downgrades) upgrades.push({ ticker, title: row?.title || "" });
      if (byTicker[ticker].downgrades > byTicker[ticker].upgrades) downgrades.push({ ticker, title: row?.title || "" });
    }
    if (redWords.some((w) => text.includes(w))) macroRed.push(row?.title || "");
    if (greenWords.some((w) => text.includes(w))) macroGreen.push(row?.title || "");
  }

  return {
    byTicker,
    upgrades: upgrades.slice(0, 8),
    downgrades: downgrades.slice(0, 8),
    macroRed: Array.from(new Set(macroRed)).slice(0, 8),
    macroGreen: Array.from(new Set(macroGreen)).slice(0, 8),
  };
}

function getTradingViewUrl(symbol) {
  const s = String(symbol || "").toUpperCase().replace("-USD", "USD");
  if (!s) return "https://www.tradingview.com";
  if (s === "BTCUSD") return "https://www.tradingview.com/chart/?symbol=BITSTAMP:BTCUSD";
  const ex = TV_EXCHANGE_HINTS[s] || "NASDAQ";
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(`${ex}:${s}`)}`;
}
const DEFAULT_PORTFOLIO = [
  { symbol: "NVDA", shares: "20", avgCost: "120" },
  { symbol: "AAPL", shares: "30", avgCost: "165" },
  { symbol: "MSFT", shares: "15", avgCost: "320" },
];
const DEFAULT_SCANNER_FILTERS = {
  minPrice: "10",
  minChange: "0.5",
  minRvol: "1",
  minScore: "55",
  sector: "ALL",
  scope: "watchlist",
};
const DEFAULT_WORKFLOW = {
  premarket: {
    checklist: [
      { id: "macro_regime", label: "Classify macro regime (Risk-On / Risk-Off)", done: false },
      { id: "key_levels", label: "Mark key levels for SPY/QQQ", done: false },
      { id: "watchlist_rank", label: "Rank top watchlist ideas by score", done: false },
      { id: "catalysts", label: "Review earnings/news catalysts", done: false },
    ],
    notes: "",
  },
  live: {
    checklist: [
      { id: "setup_quality", label: "Only take A+ setups with confirmation", done: false },
      { id: "position_size", label: "Size by risk model before entry", done: false },
      { id: "invalidation", label: "Set stop + invalidation before order", done: false },
      { id: "regime_gate", label: "Confirm trade aligns with macro regime", done: false },
      { id: "max_loss", label: "Respect daily max loss lock", done: false },
    ],
    notes: "",
  },
  postmarket: {
    checklist: [
      { id: "journal", label: "Journal each trade outcome", done: false },
      { id: "mistakes", label: "Tag mistakes and rule breaks", done: false },
      { id: "best_setups", label: "Save best setups for replay", done: false },
      { id: "next_day", label: "Build focus list for tomorrow", done: false },
    ],
    notes: "",
  },
};

function appendProviderKeys(url, providerKeys = {}) {
  const u = new URL(url, window.location.origin);
  const finnhubKey = String(providerKeys?.finnhubKey || "").trim();
  const fmpKey = String(providerKeys?.fmpKey || "").trim();
  const polygonKey = String(providerKeys?.polygonKey || "").trim();
  const uwKey = String(providerKeys?.uwKey || "").trim();
  const tradierKey = String(providerKeys?.tradierKey || "").trim();
  if (finnhubKey) u.searchParams.set("finnhubKey", finnhubKey);
  if (fmpKey) u.searchParams.set("fmpKey", fmpKey);
  if (polygonKey) u.searchParams.set("polygonKey", polygonKey);
  if (uwKey) u.searchParams.set("uwKey", uwKey);
  if (tradierKey) u.searchParams.set("tradierKey", tradierKey);
  return `${u.pathname}${u.search}`;
}

// ── API Fetch Helpers ──
function getApiErrorMessage(data, text, status) {
  const fromJson = data?.["Error Message"] || data?.message || data?.error || data?.code;
  if (fromJson) return String(fromJson);
  if (typeof text === "string" && text.trim()) return text.trim();
  return `API ${status}`;
}

function isRestrictedMessage(message) {
  const m = String(message || "").toLowerCase();
  return m.includes("restricted") || m.includes("premium") || m.includes("plan") || m.includes("limit");
}

async function fetchApiPayload(url) {
  const res = await fetch(url);
  const text = await res.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  const message = getApiErrorMessage(data, text, res.status);

  if (!res.ok) {
    throw new Error(message);
  }

  if (data && (data?.status === "error" || data?.["Error Message"] || data?.message || data?.error || data?.code)) {
    throw new Error(message);
  }

  if (!data) {
    throw new Error(message);
  }

  return data;
}

function withClientTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

function normalizeQuoteResponse(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && data.symbol) return [data];
  return [];
}

function normalizeTdQuote(data, fallbackSymbol) {
  const symbol = String(data?.symbol || fallbackSymbol || "").toUpperCase();
  if (!symbol) return null;
  const price = Number(data?.close ?? data?.price ?? data?.regularMarketPrice ?? 0);
  const prev = Number(data?.previous_close ?? data?.previousClose ?? data?.regularMarketPreviousClose ?? price);
  const impliedChange = prev ? ((price - prev) / prev) * 100 : 0;
  const yearHigh = Number(data?.fifty_two_week?.high ?? data?.fifty_two_week_high ?? data?.fiftyTwoWeekHigh ?? data?.yearHigh ?? 0);
  const yearLow = Number(data?.fifty_two_week?.low ?? data?.fifty_two_week_low ?? data?.fiftyTwoWeekLow ?? data?.yearLow ?? 0);
  const changesPercentage = Number(data?.changesPercentage ?? data?.percent_change ?? data?.regularMarketChangePercent);
  const change = Number(data?.change ?? data?.regularMarketChange ?? (price - prev));

  return {
    symbol,
    name: data?.name || data?.longName || data?.shortName || data?.instrument_name || symbol,
    price: Number.isFinite(price) ? price : 0,
    change: Number.isFinite(change) ? change : 0,
    changesPercentage: Number.isFinite(changesPercentage) ? changesPercentage : impliedChange,
    delta1d: Number.isFinite(Number(data?.delta1d)) ? Number(data?.delta1d) : (Number.isFinite(changesPercentage) ? changesPercentage : impliedChange),
    delta1w: Number.isFinite(Number(data?.delta1w)) ? Number(data?.delta1w) : 0,
    delta5m: Number.isFinite(Number(data?.delta5m)) ? Number(data?.delta5m) : 0,
    delta30m: Number.isFinite(Number(data?.delta30m)) ? Number(data?.delta30m) : 0,
    open: Number.isFinite(Number(data?.open ?? data?.regularMarketOpen)) ? Number(data?.open ?? data?.regularMarketOpen) : 0,
    previousClose: Number.isFinite(prev) ? prev : 0,
    dayHigh: Number.isFinite(Number(data?.dayHigh ?? data?.regularMarketDayHigh)) ? Number(data?.dayHigh ?? data?.regularMarketDayHigh) : 0,
    dayLow: Number.isFinite(Number(data?.dayLow ?? data?.regularMarketDayLow)) ? Number(data?.dayLow ?? data?.regularMarketDayLow) : 0,
    volume: Number.isFinite(Number(data?.volume)) ? Number(data?.volume) : 0,
    avgVolume: Number.isFinite(Number(data?.avgVolume ?? data?.average_volume ?? data?.averageDailyVolume3Month)) ? Number(data?.avgVolume ?? data?.average_volume ?? data?.averageDailyVolume3Month) : 0,
    yearHigh: Number.isFinite(yearHigh) ? yearHigh : 0,
    yearLow: Number.isFinite(yearLow) ? yearLow : 0,
    pe: Number.isFinite(Number(data?.pe)) ? Number(data?.pe) : 0,
    marketCap: Number.isFinite(Number(data?.marketCap ?? data?.market_cap)) ? Number(data?.marketCap ?? data?.market_cap) : 0,
    priceAvg50: Number.isFinite(Number(data?.priceAvg50 ?? data?.fifty_day_avg ?? data?.fifty_day_average)) ? Number(data?.priceAvg50 ?? data?.fifty_day_avg ?? data?.fifty_day_average) : 0,
    priceAvg200: Number.isFinite(Number(data?.priceAvg200 ?? data?.two_hundred_day_avg ?? data?.two_hundred_day_average)) ? Number(data?.priceAvg200 ?? data?.two_hundred_day_avg ?? data?.two_hundred_day_average) : 0,
    exchange: data?.exchange || data?.fullExchangeName || "",
  };
}

function normalizeTdBatch(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data.map((q) => normalizeTdQuote(q, q?.symbol)).filter(Boolean);
  if (data?.symbol) return [normalizeTdQuote(data, data?.symbol)].filter(Boolean);
  if (typeof data === "object") {
    return Object.entries(data)
      .map(([symbol, q]) => normalizeTdQuote(q, symbol))
      .filter(Boolean);
  }
  return [];
}

function buildPlaceholderQuotes(symbols) {
  return (symbols || []).map((symbol) => ({
    symbol,
    name: symbol,
    price: 0,
    change: 0,
    changesPercentage: 0,
    delta1d: 0,
    delta1w: 0,
    delta5m: 0,
    delta30m: 0,
    open: 0,
    previousClose: 0,
    dayHigh: 0,
    dayLow: 0,
    volume: 0,
    avgVolume: 0,
    yearHigh: 0,
    yearLow: 0,
    marketCap: 0,
    pe: 0,
    priceAvg50: 0,
    priceAvg200: 0,
  }));
}

async function fetchQuotes(symbols, providerKeys) {
  const list = symbols.join(",");
  const quoteUrl = appendProviderKeys(
    `${MARKET_BASE_URL}/quote?symbols=${encodeURIComponent(list)}`,
    providerKeys
  );
  const data = await fetchApiPayload(quoteUrl);
  return normalizeTdBatch(data);
}

async function fetchQuotesChunked(symbols, providerKeys, chunkSize = 35) {
  const clean = Array.from(new Set((symbols || []).map((s) => String(s || "").trim().toUpperCase()).filter(Boolean)));
  if (!clean.length) return [];
  const chunks = [];
  for (let i = 0; i < clean.length; i += chunkSize) {
    chunks.push(clean.slice(i, i + chunkSize));
  }
  const rows = await Promise.all(chunks.map((chunk) => fetchQuotes(chunk, providerKeys).catch(() => [])));
  const all = rows.flat();
  const dedup = new Map();
  all.forEach((q) => {
    if (q?.symbol) dedup.set(q.symbol, q);
  });
  return Array.from(dedup.values());
}

async function fetchCryptoQuotes(providerKeys) {
  try {
    const data = await fetchApiPayload(
      appendProviderKeys(`${MARKET_BASE_URL}/quote?symbols=${encodeURIComponent("BTC-USD,ETH-USD,SOL-USD")}`, providerKeys)
    );
    return normalizeTdBatch(data);
  } catch {
    return [];
  }
}

async function fetchNews(tickers, limit = 20, providerKeys) {
  if (!tickers?.length) return [];
  const url = appendProviderKeys(
    `${MARKET_BASE_URL}/news?tickers=${encodeURIComponent(tickers.join(","))}&limit=${encodeURIComponent(limit)}`,
    providerKeys
  );
  const data = await fetchApiPayload(url);
  if (!Array.isArray(data)) return [];
  return data.map((item) => ({
    ...item,
    publisher: item?.publisher || item?.source || "Unknown",
    source: item?.source || item?.publisher || "Unknown",
  }));
}

async function fetchCandles(symbol, timeframe = "1D") {
  if (!symbol) return null;
  const url = `${CANDLE_BASE_URL}/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`;
  return fetchApiPayload(url);
}

async function fetchFundamentals(symbol, providerKeys) {
  if (!symbol) return null;
  const url = appendProviderKeys(`${MARKET_BASE_URL}/fundamentals?symbol=${encodeURIComponent(symbol)}`, providerKeys);
  return fetchApiPayload(url);
}

async function fetchOptionsFlow(symbols, limit = 24, providerKeys, flowFilters = {}) {
  if (!symbols?.length) return null;
  const flowType = String(flowFilters?.flowType || "all");
  const minNotional = Number(flowFilters?.minNotional || 0);
  const unusualOnly = Boolean(flowFilters?.unusualOnly);
  const raw = `${MARKET_BASE_URL}/options-flow?symbols=${encodeURIComponent(symbols.join(","))}&limit=${encodeURIComponent(limit)}&flowType=${encodeURIComponent(flowType)}&minNotional=${encodeURIComponent(minNotional)}&unusualOnly=${encodeURIComponent(unusualOnly ? "true" : "false")}`;
  const url = appendProviderKeys(raw, providerKeys);
  return fetchApiPayload(url);
}

function isLegacyEndpointMessage(message) {
  const m = String(message || "").toLowerCase();
  return m.includes("legacy endpoint");
}

function toFriendlyApiMessage(message) {
  const raw = String(message || "");
  if (isLegacyEndpointMessage(raw)) {
    return "The old provider endpoint is no longer available. This dashboard now uses multi-provider market quotes.";
  }
  if (isRestrictedMessage(raw)) {
    return "Upstream quote source is throttling or temporarily unavailable.";
  }
  return raw;
}

async function fetchGainersLosers(apiKey) {
  return [];
}

// ── Score Computation (heuristic from quote data) ──
function computeScores(q) {
  if (!q) return { tech: 0, fund: 0, macro: 0, composite: 0 };
  
  // Technical score from price action signals
  let tech = 50;
  const chgPct = q.changesPercentage || 0;
  if (chgPct > 2) tech += 20;
  else if (chgPct > 0.5) tech += 12;
  else if (chgPct > 0) tech += 5;
  else if (chgPct > -1) tech -= 5;
  else tech -= 15;
  
  // Volume signal
  if (q.volume && q.avgVolume) {
    const rvol = q.volume / q.avgVolume;
    if (rvol > 1.5 && chgPct > 0) tech += 15;
    else if (rvol > 1.2 && chgPct > 0) tech += 8;
    else if (rvol > 1.5 && chgPct < 0) tech -= 10;
  }
  
  // Distance from year high/low
  if (q.yearHigh && q.yearLow && q.price) {
    const range = q.yearHigh - q.yearLow;
    if (range > 0) {
      const pos = (q.price - q.yearLow) / range;
      if (pos > 0.85) tech += 10;
      else if (pos > 0.6) tech += 5;
      else if (pos < 0.2) tech -= 10;
    }
  }
  
  // Fundamental placeholder (would need income statement API)
  let fund = 50;
  if (q.pe && q.pe > 0 && q.pe < 25) fund += 12;
  else if (q.pe && q.pe > 40) fund -= 8;
  if (q.marketCap > 200e9) fund += 8;
  else if (q.marketCap > 50e9) fund += 4;
  
  // Macro alignment (simplified)
  let macro = 55;
  if (chgPct > 0) macro += 8;
  
  tech = Math.max(0, Math.min(100, tech));
  fund = Math.max(0, Math.min(100, fund));
  macro = Math.max(0, Math.min(100, macro));
  const composite = Math.round(tech * 0.45 + fund * 0.35 + macro * 0.2);
  
  return { tech, fund, macro, composite };
}

function classifyTrend(q) {
  if (!q) return "—";
  const chg = q.changesPercentage || 0;
  if (chg > 2.5) return "Strong Up";
  if (chg > 0.5) return "Up";
  if (chg > -0.5) return "Flat";
  if (chg > -2) return "Weak";
  return "Down";
}

function classifyRegime(macroQuotes) {
  if (!macroQuotes || macroQuotes.length < 3) return "Loading…";
  const spy = macroQuotes.find(q => q.symbol === "SPY");
  const qqq = macroQuotes.find(q => q.symbol === "QQQ");
  const tlt = macroQuotes.find(q => q.symbol === "TLT");
  const gld = macroQuotes.find(q => q.symbol === "GLD");
  
  const spyChg = spy?.changesPercentage || 0;
  const qqqChg = qqq?.changesPercentage || 0;
  const tltChg = tlt?.changesPercentage || 0;
  const gldChg = gld?.changesPercentage || 0;
  
  if (spyChg > 0.5 && qqqChg > 0.5 && tltChg < 0) return "Risk-On";
  if (spyChg < -0.5 && gldChg > 0 && tltChg > 0) return "Risk-Off";
  if (qqqChg > spyChg + 0.3) return "Growth";
  if (spyChg > 0 && tltChg > 0) return "Goldilocks";
  if (spyChg < -0.3) return "Defensive";
  return "Neutral";
}

function buildAlerts({ watchlist, macro, regime, sectorData, customAlerts }) {
  if (!Array.isArray(watchlist) || watchlist.length === 0) return [];
  const alerts = [];
  const spy = Array.isArray(macro) ? macro.find((q) => q.symbol === "SPY") : null;
  const spyChg = spy?.changesPercentage || 0;
  const sectorMap = new Map((sectorData || []).map((s) => [s.symbol, s]));
  const customSet = new Map((customAlerts || []).map((a) => [String(a.symbol || "").toUpperCase(), Number(a.minScore || 60)]));

  watchlist.forEach((q) => {
    const symbol = q.symbol;
    const chg = q.changesPercentage || 0;
    const rvol = q.avgVolume > 0 ? q.volume / q.avgVolume : 0;
    const price = q.price || 0;
    const yearHigh = q.yearHigh || 0;
    const yearLow = q.yearLow || 0;
    const rangePos = yearHigh > yearLow ? (price - yearLow) / (yearHigh - yearLow) : 0.5;
    const relVsSpy = chg - spyChg;
    const sectorEtf = STOCK_TO_SECTOR[symbol];
    const sectorChg = sectorEtf ? (sectorMap.get(sectorEtf)?.changesPercentage || 0) : 0;
    const relVsSector = chg - sectorChg;

    if (chg > 1.5 && rvol > 1.3 && relVsSpy > 0.8) {
      alerts.push({
        symbol,
        type: "opportunity",
        category: "breakout",
        score: 90 + Math.min(9, Math.round(rvol * 2)),
        text: `Momentum expansion: +${chg.toFixed(2)}% with ${rvol.toFixed(2)}x RVOL and RS vs SPY.`,
      });
    }

    if (rangePos > 0.9 && rvol > 1.2) {
      alerts.push({
        symbol,
        type: "opportunity",
        category: "trend",
        score: 84,
        text: "Near 52W high with volume sponsorship. Watch breakout continuation.",
      });
    }
    if (q.priceAvg50 && q.price > q.priceAvg50 && chg > 0.4 && rvol > 1) {
      alerts.push({
        symbol,
        type: "opportunity",
        category: "ema-reclaim",
        score: 78,
        text: `EMA reclaim signal: price above 50D average with improving participation.`,
      });
    }
    if (relVsSector > 0.8 && relVsSpy > 0.5) {
      alerts.push({
        symbol,
        type: "opportunity",
        category: "rs-shift",
        score: 82,
        text: `Relative strength shift: outperforming both sector (${sectorEtf || "n/a"}) and SPY.`,
      });
    }

    if (chg < -2 && rvol > 1.2) {
      alerts.push({
        symbol,
        type: "risk",
        category: "distribution",
        score: 87,
        text: `Distribution risk: ${chg.toFixed(2)}% with elevated volume.`,
      });
    }

    if ((regime === "Risk-Off" || regime === "Defensive") && chg > 1.2 && relVsSpy < 0) {
      alerts.push({
        symbol,
        type: "risk",
        category: "macro-conflict",
        score: 72,
        text: "Macro regime conflict: price up but underperforming index leadership.",
      });
    }
    if (rvol > 2.2 && Math.abs(chg) < 0.35) {
      alerts.push({
        symbol,
        type: "risk",
        category: "failed-move",
        score: 69,
        text: "Heavy volume without directional progress; possible distribution/absorption.",
      });
    }

    if (customSet.has(symbol)) {
      const minScore = customSet.get(symbol);
      const currentScore = Math.round((Math.max(0, relVsSpy) * 9) + (rvol * 20) + (Math.max(0, chg) * 8));
      if (currentScore >= minScore) {
        alerts.push({
          symbol,
          type: "opportunity",
          category: "custom",
          score: Math.min(95, currentScore),
          text: `Custom alert triggered (threshold ${minScore}) with score ${currentScore}.`,
        });
      }
    }
  });

  return alerts.sort((a, b) => b.score - a.score).slice(0, 8);
}

function classifyMacroTone(macroData) {
  const get = (s) => macroData.find((q) => q.symbol === s)?.changesPercentage || 0;
  const spy = get("SPY");
  const qqq = get("QQQ");
  const vixy = get("VIXY");
  const tlt = get("TLT");
  const hyg = get("HYG");
  const uso = get("USO");
  const uup = get("UUP");

  if (spy > 0.5 && qqq > 0.5 && vixy < 0) return "Risk-On";
  if (spy < -0.5 && vixy > 0.5 && tlt > 0) return "Risk-Off";
  if (qqq > spy && tlt > 0) return "Falling-Yield Relief";
  if (uso > 1 && uup > 0.5) return "Inflation Pressure";
  if (hyg < -0.6 && spy <= 0) return "Credit Stress";
  return "Balanced";
}

// ── Tiny Components ──
const Badge = ({ children, color = C.accent, bg }) => (
  <span style={{
    fontSize: 9, fontFamily: MONO, fontWeight: 700, padding: "2px 6px",
    borderRadius: 2, color, background: bg || `${color}18`, letterSpacing: "0.04em",
    whiteSpace: "nowrap", textTransform: "uppercase",
  }}>{children}</span>
);

const ScoreBar = ({ value, color, w = "100%" }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 5, width: w }}>
    <div style={{ flex: 1, height: 4, background: C.border, borderRadius: 2, overflow: "hidden" }}>
      <div style={{
        width: `${value}%`, height: "100%", borderRadius: 2,
        background: color || (value >= 70 ? C.green : value >= 45 ? C.amber : C.red),
        transition: "width 0.4s ease",
      }} />
    </div>
    <span style={{ fontSize: 9, fontFamily: MONO, color: C.text, minWidth: 20, textAlign: "right" }}>{value}</span>
  </div>
);

const TrendTag = ({ trend }) => {
  const m = {
    "Strong Up": { c: C.green, i: "▲▲" }, "Up": { c: C.green, i: "▲" },
    "Flat": { c: C.amber, i: "◆" }, "Weak": { c: C.red, i: "▽" }, "Down": { c: C.red, i: "▼▼" },
    "—": { c: C.textDim, i: "—" },
  };
  const { c, i } = m[trend] || m["—"];
  return <Badge color={c}>{i} {trend}</Badge>;
};

const formatNum = (n) => {
  if (!n && n !== 0) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
};

const Pill = ({ active, onClick, children }) => (
  <button onClick={onClick} style={{
    fontFamily: SANS, fontSize: 12, fontWeight: 700, padding: "8px 14px",
    borderRadius: 4, border: "none", cursor: "pointer", letterSpacing: "0.02em",
    background: active ? C.accent : C.card, color: active ? "#fff" : C.textDim,
    transition: "all 0.15s",
  }}>{children}</button>
);

// ── API Key Screen ──
function PasswordLockScreen({ value, error, onChange, onSubmit }) {
  return (
    <div style={{
      minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center",
      justifyContent: "center", fontFamily: SANS,
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div style={{
        width: 420, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
        padding: 32, textAlign: "center",
      }}>
        <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 4 }}>AM TRADING</div>
        <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em", marginBottom: 20 }}>
          PASSWORD PROTECTED
        </div>
        <input
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          placeholder="Enter password"
          style={{
            width: "100%", boxSizing: "border-box", padding: "11px 12px",
            border: `1px solid ${C.border}`, borderRadius: 6, background: C.surface,
            color: C.text, fontFamily: MONO, fontSize: 13, marginBottom: 12,
          }}
        />
        {error ? <div style={{ fontSize: 11, color: C.red, marginBottom: 10 }}>{error}</div> : null}
        <button
          onClick={onSubmit}
          style={{
            width: "100%", border: `1px solid ${C.accent}`, background: C.accent, color: "#fff",
            borderRadius: 6, padding: "10px 0", fontFamily: MONO, fontSize: 11, fontWeight: 700, cursor: "pointer",
          }}
        >
          UNLOCK
        </button>
      </div>
    </div>
  );
}

function ApiKeyScreen({ onSubmit }) {
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!key.trim()) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchApiPayload(`${MARKET_BASE_URL}/quote?symbols=AAPL`);
      if (normalizeQuoteResponse(data).length > 0) {
        onSubmit(key.trim());
      } else {
        setError("Unexpected response. Verify your provider keys in server environment.");
      }
    } catch (e) {
      setError(toFriendlyApiMessage(e?.message || "Network error. Check your connection."));
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center",
      justifyContent: "center", fontFamily: SANS,
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div style={{
        width: 440, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
        padding: 40, textAlign: "center",
      }}>
        <div style={{
          fontFamily: MONO, fontSize: 28, fontWeight: 800, color: C.text,
          letterSpacing: "-0.03em", marginBottom: 4,
        }}>AXIOM</div>
        <div style={{
          fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.15em",
          marginBottom: 32, textTransform: "uppercase",
        }}>Market Intelligence Platform</div>

        <div style={{ textAlign: "left", marginBottom: 6 }}>
          <label style={{ fontSize: 10, fontFamily: MONO, color: C.textSec, letterSpacing: "0.06em" }}>
            PROVIDER ACCESS KEY
          </label>
        </div>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="Optional key (server env keys recommended)"
          style={{
            width: "100%", padding: "10px 14px", background: C.bg, border: `1px solid ${C.border}`,
            borderRadius: 4, color: C.text, fontFamily: MONO, fontSize: 12, outline: "none",
            marginBottom: 12, boxSizing: "border-box",
          }}
          onFocus={(e) => e.target.style.borderColor = C.accent}
          onBlur={(e) => e.target.style.borderColor = C.border}
        />

        {error && (
          <div style={{ fontSize: 11, color: C.red, fontFamily: SANS, marginBottom: 10 }}>{error}</div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading || !key.trim()}
          style={{
            width: "100%", padding: "10px 0", background: loading ? C.textDim : C.accent,
            color: "#fff", border: "none", borderRadius: 4, fontFamily: MONO, fontSize: 11,
            fontWeight: 700, cursor: loading ? "wait" : "pointer", letterSpacing: "0.06em",
            marginBottom: 20, opacity: (!key.trim() && !loading) ? 0.5 : 1,
          }}
        >{loading ? "VALIDATING…" : "CONNECT"}</button>

        <div style={{
          fontSize: 10, fontFamily: SANS, color: C.textDim, lineHeight: 1.7,
          borderTop: `1px solid ${C.border}`, paddingTop: 16,
        }}>
          Configure provider keys on the server for best reliability:
          <br /><span style={{ color: C.accent, fontWeight: 600 }}>FINNHUB_API_KEY</span> and <span style={{ color: C.accent, fontWeight: 600 }}>FMP_API_KEY</span>
          <br />Yahoo remains an automatic fallback when available.
        </div>
      </div>
    </div>
  );
}

// ── Macro Tape ──
function MacroTape({ data, cryptoSnapshot }) {
  if (!data.length) return null;
  const tapeRows = [...data];
  if (cryptoSnapshot && Number(cryptoSnapshot.btc || 0) > 0) {
    tapeRows.push({
      symbol: "BTCDOM",
      _label: "BTC DOM (Proxy)",
      price: Number(cryptoSnapshot.btcDomProxy || 0),
      changesPercentage: Number(cryptoSnapshot.altStrength || 0),
      _isPercentValue: true,
      _isDominance: true,
    });
  }
  return (
    <div style={{
      display: "flex", gap: 1, background: C.bg, borderBottom: `1px solid ${C.border}`,
      overflowX: "auto", scrollbarWidth: "none",
    }}>
      {tapeRows.map(q => {
        const chg = q.changesPercentage || 0;
        const isUp = chg >= 0;
        const col = q._isDominance ? C.accent : (q._label === "VIX" ? (isUp ? C.red : C.green) : (isUp ? C.green : C.red));
        return (
          <div key={q.symbol} style={{
            padding: "7px 16px", background: C.surface, display: "flex",
            alignItems: "center", gap: 10, minWidth: "fit-content",
            borderRight: `1px solid ${C.border}`,
          }}>
            <span style={{ fontSize: 11, fontFamily: MONO, color: C.textDim, fontWeight: 700 }}>
              {q._label || q.symbol}
            </span>
            <span style={{ fontSize: 15, fontFamily: MONO, color: C.text, fontWeight: 700 }}>
              {q._isPercentValue ? `${Number(q.price || 0).toFixed(1)}%` : (q.price >= 10000 ? q.price.toLocaleString(undefined, { maximumFractionDigits: 0 }) : q.price?.toFixed(2))}
            </span>
            <span style={{ fontSize: 13, fontFamily: MONO, color: col, fontWeight: 700 }}>
              {isUp ? "+" : ""}{chg.toFixed(2)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Sector Heatmap ──
function SectorHeatmap({ data }) {
  if (!data.length) return <div style={{ fontSize: 11, color: C.textDim, fontFamily: MONO, padding: 16 }}>Loading sectors…</div>;
  const sorted = [...data].sort((a, b) => (b.changesPercentage || 0) - (a.changesPercentage || 0));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 3 }}>
      {sorted.map(s => {
        const chg = s.changesPercentage || 0;
        const int = Math.min(Math.abs(chg) / 2.5, 1);
        const bg = chg >= 0
          ? `rgba(0,214,143,${0.06 + int * 0.22})`
          : `rgba(255,71,87,${0.06 + int * 0.22})`;
        const bdr = chg >= 0
          ? `rgba(0,214,143,${0.12 + int * 0.3})`
          : `rgba(255,71,87,${0.12 + int * 0.3})`;
        return (
          <div key={s.symbol} style={{
            background: bg, border: `1px solid ${bdr}`, borderRadius: 3,
            padding: "7px 5px", textAlign: "center",
          }}>
            <div style={{ fontSize: 8, fontFamily: MONO, color: C.textDim }}>{s.symbol}</div>
            <div style={{
              fontSize: 13, fontFamily: MONO, fontWeight: 800,
              color: chg >= 0 ? C.green : C.red,
            }}>
              {chg >= 0 ? "+" : ""}{chg.toFixed(2)}%
            </div>
            <div style={{ fontSize: 7, fontFamily: SANS, color: C.textDim, marginTop: 1 }}>
              {s._sectorName}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Deep Dive Modal ──
function CandlePanel({ candleData, drawTools }) {
  const bars = candleData?.bars || [];
  const ind = candleData?.indicators || {};
  if (!bars.length) {
    return <div style={{ padding: 16, color: C.textDim, fontFamily: MONO, fontSize: 11 }}>Loading candles...</div>;
  }

  const recent = bars.slice(-120);
  const ema9 = (ind.ema9 || []).slice(-120);
  const ema21 = (ind.ema21 || []).slice(-120);
  const vwap = (ind.vwap || []).slice(-120);
  const rsi = (ind.rsi || []).slice(-120);
  const macdLine = (ind.macd?.line || []).slice(-120);
  const macdSignal = (ind.macd?.signal || []).slice(-120);
  const macdHist = (ind.macd?.histogram || []).slice(-120);

  const highs = recent.map((b) => b.high).concat(ema9.map((x) => x.value), ema21.map((x) => x.value), vwap.map((x) => x.value));
  const lows = recent.map((b) => b.low).concat(ema9.map((x) => x.value), ema21.map((x) => x.value), vwap.map((x) => x.value));
  const hi = Math.max(...highs);
  const lo = Math.min(...lows);
  const priceRange = Math.max(hi - lo, 0.0001);

  const macdMax = Math.max(...macdHist.map((m) => Math.abs(m.value)), ...macdLine.map((m) => Math.abs(m.value)), ...macdSignal.map((m) => Math.abs(m.value)), 0.1);
  const toX = (i, n = recent.length) => (n <= 1 ? 0 : (i / (n - 1)) * 100);
  const toYPrice = (p) => 100 - ((p - lo) / priceRange) * 100;
  const candleW = Math.max(0.35, 80 / Math.max(recent.length, 1));
  const makePath = (arr, yMap) => arr.map((p, i) => `${toX(i, arr.length)},${yMap(p.value)}`).join(" ");
  const fibLow = Number(drawTools?.fibLow);
  const fibHigh = Number(drawTools?.fibHigh);
  const hasFib = Number.isFinite(fibLow) && Number.isFinite(fibHigh) && fibHigh > fibLow;
  const trendStart = Number(drawTools?.trendStart);
  const trendEnd = Number(drawTools?.trendEnd);
  const hasTrend = Number.isFinite(trendStart) && Number.isFinite(trendEnd);
  const fibLevels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

  return (
    <div style={{ height: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, background: "#fff", display: "grid", gridTemplateRows: "1fr 72px 72px", gap: 8 }}>
      <div style={{ position: "relative" }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: "100%", display: "block" }}>
          {[20, 40, 60, 80].map((g) => <line key={g} x1="0" y1={g} x2="100" y2={g} stroke={C.border} strokeWidth="0.35" />)}
          {recent.map((b, i) => {
            const x = toX(i);
            const yO = toYPrice(b.open);
            const yC = toYPrice(b.close);
            const yH = toYPrice(b.high);
            const yL = toYPrice(b.low);
            const up = b.close >= b.open;
            const bodyY = Math.min(yO, yC);
            const bodyH = Math.max(Math.abs(yC - yO), 0.7);
            return (
              <g key={`${b.time}-${i}`}>
                <line x1={x} y1={yH} x2={x} y2={yL} stroke={up ? C.green : C.red} strokeWidth="0.35" />
                <rect x={x - candleW / 2} y={bodyY} width={candleW} height={bodyH} fill={up ? "#d9f4e9" : "#fde4e8"} stroke={up ? C.green : C.red} strokeWidth="0.35" />
              </g>
            );
          })}
          <polyline fill="none" stroke={C.cyan} strokeWidth="0.45" points={makePath(ema9, toYPrice)} />
          <polyline fill="none" stroke={C.purple} strokeWidth="0.45" points={makePath(ema21, toYPrice)} />
          <polyline fill="none" stroke={C.amber} strokeWidth="0.45" points={makePath(vwap, toYPrice)} />
          {hasTrend && <line x1="0" y1={toYPrice(trendStart)} x2="100" y2={toYPrice(trendEnd)} stroke="#805ad5" strokeDasharray="1.2 1.2" strokeWidth="0.45" />}
          {hasFib && fibLevels.map((f) => {
            const level = fibLow + (fibHigh - fibLow) * f;
            const y = toYPrice(level);
            return (
              <g key={`fib-${f}`}>
                <line x1="0" y1={y} x2="100" y2={y} stroke="#2c7be5" strokeDasharray="0.8 1.2" strokeWidth="0.35" />
                <text x="98" y={Math.max(3, y - 0.8)} textAnchor="end" fontSize="2.4" fill="#2c7be5">{f.toFixed(3)}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 6 }}>
        <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginBottom: 3 }}>RSI(14)</div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: "calc(100% - 16px)", display: "block" }}>
          <line x1="0" y1="30" x2="100" y2="30" stroke={C.border} strokeWidth="0.3" />
          <line x1="0" y1="70" x2="100" y2="70" stroke={C.border} strokeWidth="0.3" />
          <polyline fill="none" stroke={C.accent} strokeWidth="0.7" points={rsi.map((p, i) => `${toX(i, rsi.length)},${100 - p.value}`).join(" ")} />
        </svg>
      </div>
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 6 }}>
        <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginBottom: 3 }}>MACD</div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: "calc(100% - 16px)", display: "block" }}>
          <line x1="0" y1="50" x2="100" y2="50" stroke={C.border} strokeWidth="0.3" />
          {macdHist.map((m, i) => {
            const x = toX(i, macdHist.length);
            const h = Math.min(48, (Math.abs(m.value) / macdMax) * 48);
            const y = m.value >= 0 ? 50 - h : 50;
            return <rect key={`${m.time}-${i}`} x={x - 0.2} y={y} width={0.4} height={h} fill={m.value >= 0 ? "#8dd9ba" : "#efb1ba"} />;
          })}
          <polyline fill="none" stroke={C.cyan} strokeWidth="0.6" points={macdLine.map((m, i) => `${toX(i, macdLine.length)},${50 - ((m.value / macdMax) * 45)}`).join(" ")} />
          <polyline fill="none" stroke={C.purple} strokeWidth="0.6" points={macdSignal.map((m, i) => `${toX(i, macdSignal.length)},${50 - ((m.value / macdMax) * 45)}`).join(" ")} />
        </svg>
      </div>
    </div>
  );
}

function TerminalWorkspace({
  watchlistData, macroData, sectorData, newsData, alerts,
  selectedSymbol, onSelectSymbol, timeframe, onTimeframeChange,
  candleData, loadingCandles, terminalLayout, onLayoutChange,
  hotkeyProfile, onHotkeyProfileChange, drawTools, onDrawToolsChange,
  panelSymbols, onPanelSymbolChange, panelCandleMap, fundamentals,
}) {
  const selected = watchlistData.find((q) => q.symbol === selectedSymbol) || watchlistData[0] || null;
  const [leftW, setLeftW] = useState(220);
  const [rightW, setRightW] = useState(340);
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [drag, setDrag] = useState(null);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e) => {
      if (drag === "left") setLeftW((w) => Math.max(170, Math.min(360, w + (e.movementX || 0))));
      if (drag === "right") setRightW((w) => Math.max(260, Math.min(520, w - (e.movementX || 0))));
    };
    const onUp = () => setDrag(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag]);

  if (!selected) return null;
  const chg = selected.changesPercentage || 0;
  const scores = computeScores(selected);
  const rvol = selected.avgVolume ? (selected.volume / selected.avgVolume) : 0;
  const leaderTape = macroData.filter((q) => ["SPY", "QQQ", "IWM", "DIA", "UUP", "USO", "GLD", "TLT", "BTCUSD"].includes(q.symbol));
  const topNews = newsData.filter((n) => !selected?.symbol || n.ticker === selected.symbol).slice(0, 6);
  const terminalAlertMap = useMemo(() => {
    const m = new Map();
    (alerts || []).forEach((a) => {
      const prev = Number(m.get(a.symbol) || 0);
      m.set(a.symbol, Math.max(prev, Number(a.score || 0)));
    });
    return m;
  }, [alerts]);
  const terminalRankRows = useMemo(() => {
    const spy = Number(macroData.find((q) => q.symbol === "SPY")?.changesPercentage || 0);
    return [...(watchlistData || [])]
      .map((q) => {
        const s = computeScores(q);
        const rel = Number(q.changesPercentage || 0) - spy;
        const r = q.avgVolume ? (q.volume / q.avgVolume) : 0;
        const alertBoost = Number(terminalAlertMap.get(q.symbol) || 0) * 0.2;
        const rankScore = s.composite * 0.55 + s.tech * 0.25 + Math.max(-5, Math.min(5, rel)) * 3 + Math.max(0, Math.min(3, r - 1)) * 10 + alertBoost;
        return { ...q, s, rel, r, rankScore };
      })
      .sort((a, b) => b.rankScore - a.rankScore);
  }, [watchlistData, macroData, terminalAlertMap]);
  const executionRows = useMemo(() => {
    return terminalRankRows.slice(0, 6).map((q) => {
      const entry = Number(q.price || 0);
      const stop = entry > 0 ? entry * 0.97 : 0;
      const target = entry > 0 ? entry * 1.06 : 0;
      const rr = entry > stop ? (target - entry) / Math.max(0.01, entry - stop) : 0;
      const status = rr >= 1.8 && q.r >= 1.2 ? "TRIGGERED" : rr >= 1.3 ? "STALK" : "WAIT";
      return { symbol: q.symbol, entry, stop, target, rr, status, score: q.s.composite, rvol: q.r };
    });
  }, [terminalRankRows]);
  const terminalMacroMatrix = useMemo(() => {
    const getQ = (symbol) => macroData.find((m) => m.symbol === symbol) || null;
    const safeNum = (v) => Number(v || 0);
    const gld = getQ("GLD");
    const brent = getQ("BNO") || getQ("USO");
    const y2 = getQ("SHY");
    const y10 = getQ("IEF") || getQ("TLT");
    const usd = getQ("UUP");
    const spy = getQ("SPY");
    const qqq = getQ("QQQ");
    const btc = getQ("BTCUSD");
    const eth = getQ("ETHUSD");

    const stockMove = (safeNum(spy?.changesPercentage) + safeNum(qqq?.changesPercentage)) / 2;
    const cryptoMove = (safeNum(btc?.changesPercentage) + safeNum(eth?.changesPercentage)) / 2;
    const usdMove = safeNum(usd?.changesPercentage);
    const goldMove = safeNum(gld?.changesPercentage);
    const brentMove = safeNum(brent?.changesPercentage);
    const y2Move = safeNum(y2?.changesPercentage);
    const y10Move = safeNum(y10?.changesPercentage);
    const curveProxy = y10Move - y2Move;

    const rel = [];
    rel.push(`Dollar vs Stocks: ${usdMove >= 0 && stockMove <= 0 ? "Inverse (risk-off pressure)" : usdMove <= 0 && stockMove >= 0 ? "Supportive (risk-on)" : "Mixed"}`);
    rel.push(`Dollar vs Crypto: ${usdMove >= 0 && cryptoMove <= 0 ? "Inverse (crypto headwind)" : usdMove <= 0 && cryptoMove >= 0 ? "Supportive (crypto tailwind)" : "Mixed"}`);
    rel.push(`Gold vs Dollar: ${goldMove >= 0 && usdMove <= 0 ? "Classic hedge bid" : goldMove <= 0 && usdMove >= 0 ? "Dollar pressure on metals" : "Mixed"}`);
    rel.push(`Brent vs Equities: ${brentMove > 0.8 && stockMove < 0 ? "Inflation stress signal" : brentMove < 0 && stockMove > 0 ? "Cost relief for risk assets" : "Neutral"}`);
    rel.push(`2Y/10Y Proxy: ${curveProxy > 0 ? "Long-end outperforming short-end" : curveProxy < 0 ? "Front-end pressure > long-end" : "Flat"}`);

    return {
      rows: [
        { key: "Gold", symbol: gld?.symbol || "GLD", price: safeNum(gld?.price), chg: goldMove },
        { key: "Brent", symbol: brent?.symbol || "BNO", price: safeNum(brent?.price), chg: brentMove },
        { key: "2Y", symbol: y2?.symbol || "SHY", price: safeNum(y2?.price), chg: y2Move },
        { key: "10Y", symbol: y10?.symbol || "IEF", price: safeNum(y10?.price), chg: y10Move },
        { key: "Dollar", symbol: usd?.symbol || "UUP", price: safeNum(usd?.price), chg: usdMove },
        { key: "BTC", symbol: btc?.symbol || "BTCUSD", price: safeNum(btc?.price), chg: safeNum(btc?.changesPercentage) },
      ],
      rel,
      stockMove,
      cryptoMove,
      curveProxy,
    };
  }, [macroData]);
  const institutionalRadar = useMemo(() => {
    const advancers = terminalRankRows.filter((x) => Number(x.changesPercentage || 0) > 0).length;
    const total = terminalRankRows.length || 0;
    const breadthPct = total ? (advancers / total) * 100 : 0;
    const vix = Number(macroData.find((m) => m.symbol === "VIXY")?.changesPercentage || 0);
    const usd = Number(macroData.find((m) => m.symbol === "UUP")?.changesPercentage || 0);
    const oil = Number(macroData.find((m) => m.symbol === "USO")?.changesPercentage || 0);
    const macroPressureScore = vix * 0.5 + usd * 0.3 + Math.max(0, oil) * 0.2;
    const macroPressureLabel = macroPressureScore > 1.5 ? "HIGH" : macroPressureScore > 0.4 ? "ELEVATED" : "LOW";
    const focus = executionRows[0] || null;
    const focusStatus = String(focus?.status || "WATCH").toUpperCase();
    const focusTone = focusStatus === "TRIGGERED" ? "green" : focusStatus === "STALK" ? "amber" : "red";
    return { advancers, total, breadthPct, macroPressureScore, macroPressureLabel, focus: focus?.symbol || selected?.symbol || "N/A", focusStatus, focusTone };
  }, [terminalRankRows, macroData, executionRows, selected]);
  const riskSnapshot = useMemo(() => {
    const riskAlerts = (alerts || []).filter((a) => a.type === "risk").length;
    const avgRR = executionRows.length ? executionRows.reduce((sum, r) => sum + r.rr, 0) / executionRows.length : 0;
    const topSectors = {};
    executionRows.forEach((r) => {
      const sec = STOCK_TO_SECTOR[r.symbol] || "OTHER";
      topSectors[sec] = (topSectors[sec] || 0) + 1;
    });
    const concentration = Object.values(topSectors).length ? Math.max(...Object.values(topSectors)) : 0;
    const mode = riskAlerts >= 3 || concentration >= 4 ? "DEFENSIVE" : avgRR >= 1.6 ? "AGGRESSIVE" : "BALANCED";
    return { riskAlerts, avgRR, concentration, mode };
  }, [alerts, executionRows]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: `${showLeft ? `${leftW}px` : "0px"} ${showLeft ? "6px" : "0px"} 1fr ${showRight ? "6px" : "0px"} ${showRight ? `${rightW}px` : "0px"}`, gap: 0, minHeight: "calc(100vh - 164px)" }}>
      {showLeft && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", display: "flex", flexDirection: "column", marginRight: 4 }}>
          <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em", display: "flex", justifyContent: "space-between" }}>
            WATCHLIST GRID
            <button onClick={() => setShowLeft(false)} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.textDim, fontFamily: MONO, fontSize: 10 }}>HIDE</button>
          </div>
          <div style={{ overflowY: "auto" }}>
            {watchlistData.slice(0, 20).map((q) => {
              const up = (q.changesPercentage || 0) >= 0;
              const active = q.symbol === selected.symbol;
              return (
                <button key={q.symbol} onClick={() => onSelectSymbol(q.symbol)} style={{ width: "100%", textAlign: "left", border: "none", cursor: "pointer", padding: "9px 10px", borderBottom: `1px solid ${C.border}`, background: active ? C.cardHover : "transparent" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>{q.symbol}</span>
                    <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: up ? C.green : C.red }}>{up ? "+" : ""}{(q.changesPercentage || 0).toFixed(2)}%</span>
                  </div>
                  <div style={{ marginTop: 2, fontFamily: MONO, fontSize: 10, color: C.textDim }}>${q.price?.toFixed(2)}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {showLeft && <div onMouseDown={() => setDrag("left")} style={{ cursor: "col-resize", background: C.border, borderRadius: 6 }} />}

      <div style={{ display: "grid", gridTemplateRows: "1fr auto", gap: 10, margin: "0 4px" }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", display: "grid", gridTemplateRows: "auto 1fr auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
            <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
              <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800 }}>{selected.symbol}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>${selected.price?.toFixed(2)}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: chg >= 0 ? C.green : C.red }}>{chg >= 0 ? "+" : ""}{chg.toFixed(2)}%</span>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {!showLeft && <button onClick={() => setShowLeft(true)} style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textDim, fontFamily: MONO, fontSize: 10, padding: "4px 8px", borderRadius: 4, cursor: "pointer" }}>SHOW WL</button>}
              {!showRight && <button onClick={() => setShowRight(true)} style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textDim, fontFamily: MONO, fontSize: 10, padding: "4px 8px", borderRadius: 4, cursor: "pointer" }}>SHOW INTEL</button>}
              {["1", "2", "4"].map((l) => (
                <button key={`layout-${l}`} onClick={() => onLayoutChange(l)} style={{ border: `1px solid ${terminalLayout === l ? C.accent : C.border}`, background: terminalLayout === l ? `${C.accent}12` : C.surface, color: terminalLayout === l ? C.accent : C.textDim, fontFamily: MONO, fontSize: 10, padding: "4px 8px", borderRadius: 4, cursor: "pointer" }}>
                  {l}x
                </button>
              ))}
              <select value={hotkeyProfile} onChange={(e) => onHotkeyProfileChange(e.target.value)} style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textDim, fontFamily: MONO, fontSize: 10, padding: "4px 6px", borderRadius: 4 }}>
                <option value="classic">HK Classic</option>
                <option value="scalper">HK Scalper</option>
              </select>
              {["5M", "15M", "1H", "1D", "1W"].map((tf) => (
                <button key={tf} onClick={() => onTimeframeChange(tf)} style={{ border: `1px solid ${timeframe === tf ? C.accent : C.border}`, background: timeframe === tf ? `${C.accent}12` : C.surface, color: timeframe === tf ? C.accent : C.textDim, fontFamily: MONO, fontSize: 10, padding: "4px 8px", borderRadius: 4, cursor: "pointer" }}>
                  {tf}
                </button>
              ))}
            </div>
          </div>
          <div style={{ padding: 10, background: "linear-gradient(180deg,#ffffff 0%,#f8fbff 100%)", display: "grid", gap: 10, gridTemplateColumns: "1.15fr 1fr" }}>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface, overflow: "hidden", display: "grid", gridTemplateRows: "auto 1fr" }}>
              <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em" }}>INSTITUTIONAL RANKING LADDER</span>
                <Badge color={C.accent}>LIVE</Badge>
              </div>
              <div style={{ overflowY: "auto", maxHeight: terminalLayout === "1" ? 400 : 220 }}>
                {terminalRankRows.slice(0, 16).map((q, idx) => (
                  <button
                    key={`rank-${q.symbol}`}
                    onClick={() => onSelectSymbol(q.symbol)}
                    style={{ width: "100%", border: "none", borderBottom: `1px solid ${C.border}`, background: selected.symbol === q.symbol ? C.cardHover : C.surface, padding: "8px 10px", textAlign: "left", cursor: "pointer" }}
                  >
                    <div style={{ display: "grid", gridTemplateColumns: "28px 56px 1fr 68px 64px 72px", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>#{idx + 1}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.text }}>{q.symbol}</span>
                      <span style={{ fontSize: 10, color: C.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.name}</span>
                      <span style={{ fontFamily: MONO, fontSize: 10, color: (q.changesPercentage || 0) >= 0 ? C.green : C.red }}>{(q.changesPercentage || 0) >= 0 ? "+" : ""}{(q.changesPercentage || 0).toFixed(2)}%</span>
                      <span style={{ fontFamily: MONO, fontSize: 10, color: q.r >= 1.2 ? C.green : C.textDim }}>R {q.r.toFixed(2)}x</span>
                      <span style={{ fontFamily: MONO, fontSize: 10, color: C.accent }}>S {q.s.composite}</span>
                    </div>
                  </button>
                ))}
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, background: "#f9fbff", padding: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>
                  MACRO RELATION MATRIX
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  {terminalMacroMatrix.rows.map((m) => (
                    <div key={`mx-${m.key}`} style={{ border: `1px solid ${C.border}`, borderRadius: 6, background: C.surface, padding: "7px 8px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontFamily: MONO, fontSize: 10, color: C.text }}>{m.key}</span>
                        <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{m.symbol}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontFamily: MONO, fontSize: 11, color: C.text, fontWeight: 700 }}>
                          {m.price > 10000 ? m.price.toLocaleString(undefined, { maximumFractionDigits: 0 }) : m.price.toFixed(2)}
                        </span>
                        <span style={{ fontFamily: MONO, fontSize: 10, color: m.chg >= 0 ? C.green : C.red }}>
                          {m.chg >= 0 ? "+" : ""}{m.chg.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, background: C.surface, padding: 8 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>Stocks (SPY/QQQ)</div>
                      <div style={{ fontFamily: MONO, fontSize: 11, color: terminalMacroMatrix.stockMove >= 0 ? C.green : C.red, fontWeight: 700 }}>
                        {terminalMacroMatrix.stockMove >= 0 ? "+" : ""}{terminalMacroMatrix.stockMove.toFixed(2)}%
                      </div>
                    </div>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>Crypto (BTC/ETH)</div>
                      <div style={{ fontFamily: MONO, fontSize: 11, color: terminalMacroMatrix.cryptoMove >= 0 ? C.green : C.red, fontWeight: 700 }}>
                        {terminalMacroMatrix.cryptoMove >= 0 ? "+" : ""}{terminalMacroMatrix.cryptoMove.toFixed(2)}%
                      </div>
                    </div>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>Curve (10Y-2Y proxy)</div>
                      <div style={{ fontFamily: MONO, fontSize: 11, color: terminalMacroMatrix.curveProxy >= 0 ? C.green : C.red, fontWeight: 700 }}>
                        {terminalMacroMatrix.curveProxy >= 0 ? "+" : ""}{terminalMacroMatrix.curveProxy.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: 4 }}>
                    {terminalMacroMatrix.rel.map((line, i) => (
                      <div key={`mrel-${i}`} style={{ fontSize: 10, color: C.textSec, lineHeight: 1.4 }}>{line}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gap: 10, gridTemplateRows: "1fr auto" }}>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface, overflow: "hidden", display: "grid", gridTemplateRows: "auto 1fr" }}>
                <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em" }}>EXECUTION BLOTTER</span>
                  <Badge color={C.green}>A+ FILTER</Badge>
                </div>
                <div style={{ display: "grid", gridTemplateRows: "auto auto 1fr", minHeight: terminalLayout === "1" ? 390 : 180 }}>
                  <div>
                    {executionRows.map((r) => (
                      <div key={`ex-${r.symbol}`} style={{ borderBottom: `1px solid ${C.border}`, padding: "8px 10px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "54px 70px 70px 70px 52px 1fr", gap: 8, alignItems: "center" }}>
                          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.text }}>{r.symbol}</span>
                          <span style={{ fontFamily: MONO, fontSize: 10, color: C.textSec }}>E ${r.entry.toFixed(2)}</span>
                          <span style={{ fontFamily: MONO, fontSize: 10, color: C.red }}>S ${r.stop.toFixed(2)}</span>
                          <span style={{ fontFamily: MONO, fontSize: 10, color: C.green }}>T ${r.target.toFixed(2)}</span>
                          <span style={{ fontFamily: MONO, fontSize: 10, color: C.accent }}>{r.rr.toFixed(2)}R</span>
                          <span style={{ justifySelf: "end" }}>
                            <Badge color={r.status === "TRIGGERED" ? C.green : r.status === "STALK" ? C.amber : C.textDim}>{r.status}</Badge>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: "10px", background: "#fbfdff", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>
                      ACTION QUEUE
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, background: C.surface }}>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginBottom: 6 }}>NEXT NAMES</div>
                        {(executionRows.slice(0, 3)).map((r) => (
                          <div key={`aq-${r.symbol}`} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0" }}>
                            <span style={{ fontFamily: MONO, color: C.text }}>{r.symbol}</span>
                            <span style={{ fontFamily: MONO, color: r.status === "TRIGGERED" ? C.green : r.status === "STALK" ? C.amber : C.textDim }}>
                              {r.status}
                            </span>
                          </div>
                        ))}
                        {!executionRows.length && <div style={{ fontSize: 11, color: C.textDim }}>No live setups yet.</div>}
                      </div>
                      <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, background: C.surface }}>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginBottom: 6 }}>CATALYST CHECK</div>
                        {(topNews.length ? topNews : newsData.slice(0, 3)).slice(0, 3).map((n, i) => (
                          <div key={`aqn-${i}`} style={{ fontSize: 10, color: C.textSec, lineHeight: 1.35, padding: "3px 0", borderBottom: `1px solid ${C.border}` }}>
                            <span style={{ fontFamily: MONO, color: C.accent }}>{n.ticker || "MKT"}</span> {n.title}
                          </div>
                        ))}
                        {!newsData.length && <div style={{ fontSize: 11, color: C.textDim }}>No catalyst headlines loaded.</div>}
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: 10, background: "#f8fbff" }}>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>
                      MARKET PULSE
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                      <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, background: C.surface }}>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>Top Gainer</div>
                        <div style={{ fontFamily: MONO, fontSize: 12, color: C.green, fontWeight: 700 }}>{terminalRankRows[0]?.symbol || "N/A"}</div>
                        <div style={{ fontFamily: MONO, fontSize: 10, color: C.green }}>{(terminalRankRows[0]?.changesPercentage || 0) >= 0 ? "+" : ""}{Number(terminalRankRows[0]?.changesPercentage || 0).toFixed(2)}%</div>
                      </div>
                      <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, background: C.surface }}>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>Weakest Name</div>
                        <div style={{ fontFamily: MONO, fontSize: 12, color: C.red, fontWeight: 700 }}>{terminalRankRows[terminalRankRows.length - 1]?.symbol || "N/A"}</div>
                        <div style={{ fontFamily: MONO, fontSize: 10, color: C.red }}>{(terminalRankRows[terminalRankRows.length - 1]?.changesPercentage || 0) >= 0 ? "+" : ""}{Number(terminalRankRows[terminalRankRows.length - 1]?.changesPercentage || 0).toFixed(2)}%</div>
                      </div>
                      <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, background: C.surface }}>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>Best RS vs SPY</div>
                        <div style={{ fontFamily: MONO, fontSize: 12, color: C.accent, fontWeight: 700 }}>
                          {[...terminalRankRows].sort((a, b) => (b.rel || 0) - (a.rel || 0))[0]?.symbol || "N/A"}
                        </div>
                        <div style={{ fontFamily: MONO, fontSize: 10, color: C.accent }}>
                          {(([...terminalRankRows].sort((a, b) => (b.rel || 0) - (a.rel || 0))[0]?.rel || 0) >= 0 ? "+" : "")}
                          {Number(([...terminalRankRows].sort((a, b) => (b.rel || 0) - (a.rel || 0))[0]?.rel || 0)).toFixed(2)}%
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: 8, border: `1px solid ${C.border}`, borderRadius: 6, background: C.surface, padding: 8 }}>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.08em", marginBottom: 6 }}>
                        INSTITUTIONAL RADAR
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                        <div style={{ border: `1px solid ${institutionalRadar.breadthPct >= 60 ? `${C.green}66` : institutionalRadar.breadthPct >= 45 ? `${C.amber}66` : `${C.red}66`}`, borderRadius: 5, padding: 7, background: institutionalRadar.breadthPct >= 60 ? C.greenBg : institutionalRadar.breadthPct >= 45 ? C.amberBg : C.redBg }}>
                          <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>Breadth</div>
                          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>
                            {institutionalRadar.advancers}/{institutionalRadar.total}
                          </div>
                          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textSec }}>
                            {institutionalRadar.total ? `${Math.round(institutionalRadar.breadthPct)}% advancers` : "No data"}
                          </div>
                        </div>
                        <div style={{ border: `1px solid ${institutionalRadar.macroPressureLabel === "HIGH" ? `${C.red}66` : institutionalRadar.macroPressureLabel === "ELEVATED" ? `${C.amber}66` : `${C.green}66`}`, borderRadius: 5, padding: 7, background: institutionalRadar.macroPressureLabel === "HIGH" ? C.redBg : institutionalRadar.macroPressureLabel === "ELEVATED" ? C.amberBg : C.greenBg }}>
                          <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>Macro Pressure</div>
                          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>
                            <span style={{ color: institutionalRadar.macroPressureLabel === "HIGH" ? C.red : institutionalRadar.macroPressureLabel === "ELEVATED" ? C.amber : C.green }}>
                              {institutionalRadar.macroPressureLabel}
                            </span>
                          </div>
                          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textSec }}>VIX + USD + Oil</div>
                        </div>
                        <div style={{ border: `1px solid ${institutionalRadar.focusTone === "green" ? `${C.green}66` : institutionalRadar.focusTone === "amber" ? `${C.amber}66` : `${C.red}66`}`, borderRadius: 5, padding: 7, background: institutionalRadar.focusTone === "green" ? C.greenBg : institutionalRadar.focusTone === "amber" ? C.amberBg : C.redBg }}>
                          <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>Session Focus</div>
                          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.accent }}>
                            {institutionalRadar.focus}
                          </div>
                          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textSec }}>
                            {institutionalRadar.focusStatus}
                          </div>
                        </div>
                      </div>
                      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 6 }}>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginBottom: 4 }}>Signal Queue</div>
                        {(alerts || []).slice(0, 3).map((a, i) => (
                          <div key={`radar-sig-${i}`} style={{ display: "grid", gridTemplateColumns: "60px 1fr 52px", gap: 8, alignItems: "center", padding: "4px 6px", fontSize: 10, border: `1px solid ${Number(a.score || 0) >= 85 ? `${C.green}66` : Number(a.score || 0) >= 70 ? `${C.amber}66` : `${C.border}`}`, borderRadius: 4, marginBottom: 4, background: Number(a.score || 0) >= 85 ? C.greenBg : Number(a.score || 0) >= 70 ? C.amberBg : C.surface }}>
                            <span style={{ fontFamily: MONO, color: C.accent, fontWeight: 700 }}>{a.symbol || "MKT"}</span>
                            <span style={{ color: C.textSec, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.text || "Signal update"}</span>
                            <span style={{ fontFamily: MONO, color: Number(a.score || 0) >= 85 ? C.green : Number(a.score || 0) >= 70 ? C.amber : C.textDim, justifySelf: "end", fontWeight: 700 }}>S {Number(a.score || 0)}</span>
                          </div>
                        ))}
                        {!(alerts || []).length && (
                          <div style={{ fontSize: 10, color: C.textDim }}>No high-priority signals queued.</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface, padding: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>RISK COMMAND PANEL</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>Mode</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: riskSnapshot.mode === "DEFENSIVE" ? C.red : riskSnapshot.mode === "AGGRESSIVE" ? C.green : C.amber, fontWeight: 700 }}>{riskSnapshot.mode}</div>
                  </div>
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>Risk Alerts</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: riskSnapshot.riskAlerts > 2 ? C.red : C.text }}>{riskSnapshot.riskAlerts}</div>
                  </div>
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>Avg R:R</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: riskSnapshot.avgRR >= 1.5 ? C.green : C.amber }}>{riskSnapshot.avgRR.toFixed(2)}</div>
                  </div>
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>Sector Concentration</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: riskSnapshot.concentration >= 4 ? C.red : C.text }}>{riskSnapshot.concentration}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 1, background: C.border }}>
            {[["Composite", scores.composite, C.accent], ["Technical", scores.tech, C.cyan], ["Fundamental", scores.fund, C.purple], ["Macro Fit", scores.macro, C.amber], ["RVOL", `${rvol.toFixed(2)}x`, rvol > 1.2 ? C.green : C.textDim]].map(([k, v, col]) => (
              <div key={k} style={{ background: C.surface, padding: "8px 10px" }}>
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{k}</div>
                <div style={{ fontFamily: MONO, fontSize: 14, color: col, fontWeight: 700 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8, marginBottom: 10 }}>
            <input value={drawTools.trendStart} onChange={(e) => onDrawToolsChange((d) => ({ ...d, trendStart: e.target.value }))} placeholder="Trend start" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 10 }} />
            <input value={drawTools.trendEnd} onChange={(e) => onDrawToolsChange((d) => ({ ...d, trendEnd: e.target.value }))} placeholder="Trend end" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 10 }} />
            <input value={drawTools.fibLow} onChange={(e) => onDrawToolsChange((d) => ({ ...d, fibLow: e.target.value }))} placeholder="Fib low" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 10 }} />
            <input value={drawTools.fibHigh} onChange={(e) => onDrawToolsChange((d) => ({ ...d, fibHigh: e.target.value }))} placeholder="Fib high" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 10 }} />
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>SECTOR ROTATION TAPE</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 6 }}>
            {[...sectorData].sort((a, b) => (b.changesPercentage || 0) - (a.changesPercentage || 0)).slice(0, 8).map((s) => (
              <div key={s.symbol} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px", background: C.surface }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.text }}>{s.symbol}</div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: (s.changesPercentage || 0) >= 0 ? C.green : C.red }}>{(s.changesPercentage || 0) >= 0 ? "+" : ""}{(s.changesPercentage || 0).toFixed(2)}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showRight && <div onMouseDown={() => setDrag("right")} style={{ cursor: "col-resize", background: C.border, borderRadius: 6 }} />}
      {showRight && (
        <div style={{ display: "grid", gridTemplateRows: "auto auto auto 1fr", gap: 10, marginLeft: 4 }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
              <span>MACRO / REGIME</span>
              <button onClick={() => setShowRight(false)} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.textDim, fontFamily: MONO, fontSize: 10 }}>HIDE</button>
            </div>
            {leaderTape.slice(0, 6).map((q) => (
              <div key={q.symbol} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.text }}>{q.symbol}</span>
                <span style={{ fontFamily: MONO, fontSize: 10, color: (q.changesPercentage || 0) >= 0 ? C.green : C.red }}>{(q.changesPercentage || 0) >= 0 ? "+" : ""}{(q.changesPercentage || 0).toFixed(2)}%</span>
              </div>
            ))}
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>
              FUNDAMENTALS — {selected.symbol}
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 11, color: C.textDim }}>Market Cap</span><span style={{ fontFamily: MONO, fontSize: 11, color: C.text }}>{formatNum(fundamentals?.marketCap || selected.marketCap || 0)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 11, color: C.textDim }}>P/E</span><span style={{ fontFamily: MONO, fontSize: 11, color: C.text }}>{Number.isFinite(Number(fundamentals?.pe)) ? Number(fundamentals.pe).toFixed(2) : "—"}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 11, color: C.textDim }}>EPS</span><span style={{ fontFamily: MONO, fontSize: 11, color: C.text }}>{Number.isFinite(Number(fundamentals?.eps)) ? Number(fundamentals.eps).toFixed(2) : "—"}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 11, color: C.textDim }}>Shares Out</span><span style={{ fontFamily: MONO, fontSize: 11, color: C.text }}>{fundamentals?.sharesOutstanding ? `${(Number(fundamentals.sharesOutstanding) / 1e9).toFixed(2)}B` : "—"}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 11, color: C.textDim }}>Earnings</span><span style={{ fontFamily: MONO, fontSize: 11, color: C.text }}>{fundamentals?.earningsDate ? new Date(fundamentals.earningsDate).toLocaleDateString() : "TBD"}</span></div>
            </div>
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>ALERT PRIORITY</div>
            {alerts.slice(0, 4).map((a, i) => (
              <div key={`${a.symbol}-${i}`} style={{ padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700 }}>{a.symbol}</span>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: a.type === "risk" ? C.red : C.green }}>{a.score}</span>
                </div>
                <div style={{ fontSize: 11, color: C.textSec, lineHeight: 1.35 }}>{a.text}</div>
              </div>
            ))}
            {alerts.length === 0 && <div style={{ fontSize: 11, color: C.textDim }}>No active alerts.</div>}
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, overflowY: "auto" }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>NEWS INTELLIGENCE</div>
            {(topNews.length ? topNews : newsData.slice(0, 6)).map((n, i) => (
              <a key={`${n.ticker}-${i}`} href={n.link} target="_blank" rel="noreferrer" style={{ display: "block", textDecoration: "none", padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.accent, marginBottom: 3 }}>{n.ticker} · {n.publisher}</div>
                <div style={{ fontSize: 11, color: C.textSec, lineHeight: 1.35 }}>{n.title}</div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DeepDive({ stock, fundamentals, onClose, onExit, onOpenTradingView }) {
  if (!stock) return null;
  const chg = stock.changesPercentage || 0;
  const isUp = chg >= 0;
  const scores = computeScores(stock);
  const trend = classifyTrend(stock);
  const sma50 = Number(stock.priceAvg50 || 0);
  const sma200 = Number(stock.priceAvg200 || 0);
  const yearHigh = Number(stock.yearHigh || 0);
  const yearLow = Number(stock.yearLow || 0);
  const yearRange = yearHigh > yearLow ? yearHigh - yearLow : 0;
  const yearPos = yearRange > 0 ? ((stock.price - yearLow) / yearRange) * 100 : 50;
  const atrProxyPct = stock.price ? (((stock.dayHigh || stock.price) - (stock.dayLow || stock.price)) / stock.price) * 100 : 0;
  const trendState = stock.price > sma50 && sma50 > sma200 ? "Primary Uptrend" : stock.price < sma50 && sma50 < sma200 ? "Primary Downtrend" : "Transition / Range";
  const structureState = yearPos >= 75 ? "Near highs (breakout zone)" : yearPos <= 30 ? "Near lows (repair zone)" : "Mid-range (rotation zone)";
  const valuationState = stock.pe > 0 ? (stock.pe < 25 ? "Reasonable" : stock.pe < 45 ? "Rich" : "Extended") : "Unavailable";
  const qualityState = scores.fund >= 68 ? "High Quality" : scores.fund >= 52 ? "Average Quality" : "Lower Quality";
  const macroFit = scores.macro >= 65 ? "Aligned" : scores.macro >= 50 ? "Neutral" : "Misaligned";
  const rvol = stock.volume && stock.avgVolume ? (stock.volume / stock.avgVolume).toFixed(2) : "—";
  const entry = sma50 > 0 ? ((stock.price + sma50) / 2) : stock.price;
  const stop = entry * (trendState === "Primary Uptrend" ? 0.965 : 0.95);
  const target1 = entry * 1.05;
  const target2 = entry * 1.1;
  const rr = (target1 - entry) / Math.max(0.01, entry - stop);
  const setup = trendState === "Primary Uptrend" && rr >= 1.5 && Number(rvol || 0) >= 1.1 ? "BUY / STALK" : rr >= 1.2 ? "WAIT / CONFIRM" : "AVOID / REDUCE";
  const riskBudget = 750;
  const riskPerShare = Math.max(0.01, entry - stop);
  const sizeShares = Math.floor(riskBudget / riskPerShare);
  const positionValue = sizeShares * entry;
  const bullProb = Math.max(15, Math.min(80, Math.round((scores.tech * 0.5 + scores.fund * 0.3 + scores.macro * 0.2))));
  const baseProb = Math.max(10, Math.min(60, Math.round(100 - Math.abs(chg) * 6 - Math.abs(50 - yearPos) * 0.3)));
  const bearProb = Math.max(10, 100 - bullProb - baseProb);
  const catalystNote = stock.volume > (stock.avgVolume || 0) ? "Volume sponsorship active" : "Needs stronger participation";
  const riskNote = stock.price < sma50 ? "Below 50D trend support" : "Trend intact while above 50D";
  const resolvedMarketCap = Number(fundamentals?.marketCap || stock.marketCap || 0);
  const resolvedPe = Number.isFinite(Number(fundamentals?.pe)) && Number(fundamentals?.pe) > 0 ? Number(fundamentals?.pe) : Number(stock.pe || 0);
  const resolvedEps = Number.isFinite(Number(fundamentals?.eps)) && Number(fundamentals?.eps) > 0 ? Number(fundamentals?.eps) : Number(stock.eps || 0);
  const fallbackEps = resolvedPe > 0 && stock.price > 0 ? (stock.price / resolvedPe) : (stock.price > 0 ? stock.price / 28 : 0);
  const modeledEps = resolvedEps > 0 ? resolvedEps : fallbackEps;
  const growthAnchor = Math.max(-0.25, Math.min(0.35, ((scores.fund - 50) / 220) + (trendState === "Primary Uptrend" ? 0.04 : trendState === "Primary Downtrend" ? -0.04 : 0)));
  const baseGrowth = growthAnchor;
  const bullGrowth = Math.min(0.55, baseGrowth + 0.09);
  const bearGrowth = Math.max(-0.35, baseGrowth - 0.10);
  const peAnchor = resolvedPe > 0 ? resolvedPe : (valuationState === "Reasonable" ? 24 : valuationState === "Rich" ? 32 : 20);
  const bullMultiple = Math.max(10, peAnchor * (trendState === "Primary Uptrend" ? 1.16 : 1.08));
  const baseMultiple = Math.max(10, peAnchor * 1.0);
  const bearMultiple = Math.max(8, peAnchor * (trendState === "Primary Downtrend" ? 0.74 : 0.82));
  let bull12m = modeledEps > 0 ? (modeledEps * (1 + bullGrowth) * bullMultiple) : 0;
  let base12m = modeledEps > 0 ? (modeledEps * (1 + baseGrowth) * baseMultiple) : 0;
  let bear12m = modeledEps > 0 ? (modeledEps * (1 + bearGrowth) * bearMultiple) : 0;
  if (!(bull12m > 0 && base12m > 0 && bear12m > 0)) {
    const fallbackBase = stock.price > 0 ? stock.price * (1 + Math.max(-0.12, Math.min(0.18, growthAnchor))) : 0;
    base12m = fallbackBase;
    bull12m = fallbackBase * 1.2;
    bear12m = fallbackBase * 0.78;
  }
  const priceNow = Number(stock.price || 0);
  const upsideBasePct = priceNow > 0 ? ((base12m / priceNow) - 1) * 100 : 0;
  const upsideBullPct = priceNow > 0 ? ((bull12m / priceNow) - 1) * 100 : 0;
  const downsideBearPct = priceNow > 0 ? ((bear12m / priceNow) - 1) * 100 : 0;
  const estModelTag = resolvedEps > 0 && resolvedPe > 0 ? "EPS x P/E model" : "Hybrid proxy model";
  const techTrendScore = stock.price > sma50 && sma50 > sma200 ? 85 : stock.price > sma50 ? 68 : stock.price > sma200 ? 55 : 38;
  const techMomentumScore = Math.max(20, Math.min(95, 50 + chg * 7 + (Number(rvol || 0) - 1) * 18));
  const techStructureScore = Math.max(20, Math.min(95, 45 + (yearPos - 50) * 0.9));
  const techVolatilityScore = Math.max(20, Math.min(95, 75 - atrProxyPct * 4.5));
  const technicalDeepScore = Math.round(techTrendScore * 0.35 + techMomentumScore * 0.25 + techStructureScore * 0.25 + techVolatilityScore * 0.15);

  const fundValuationScore = resolvedPe > 0 ? (resolvedPe < 20 ? 84 : resolvedPe < 30 ? 72 : resolvedPe < 45 ? 58 : 42) : 52;
  const fundEpsScore = resolvedEps > 0 ? Math.min(90, 52 + resolvedEps * 6) : 46;
  const fundQualityScore = scores.fund;
  const fundDurabilityScore = Math.max(30, Math.min(90, 55 + (resolvedMarketCap > 2e11 ? 14 : resolvedMarketCap > 5e10 ? 8 : 2) - (atrProxyPct > 6 ? 8 : 0)));
  const fundamentalDeepScore = Math.round(fundValuationScore * 0.3 + fundEpsScore * 0.25 + fundQualityScore * 0.25 + fundDurabilityScore * 0.2);
  const panelCard = {
    background: C.surface,
    border: `1px solid ${C.borderLit}`,
    borderRadius: 10,
    boxShadow: "0 8px 22px rgba(21, 44, 78, 0.08)",
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "linear-gradient(180deg, #f4f8ff 0%, #edf3fb 100%)",
      zIndex: 1000, overflow: "hidden",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: "100%", minHeight: "100vh", background: "transparent",
        border: "none", borderRadius: 0, overflowY: "auto", overflowX: "hidden", boxSizing: "border-box",
      }}>
        {/* Header */}
        <div style={{
          position: "sticky", top: 0, zIndex: 5,
          padding: "20px 24px", borderBottom: `1px solid ${C.borderLit}`,
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          flexWrap: "wrap", gap: 10,
          background: "linear-gradient(180deg, #ffffff 0%, #f2f7ff 100%)",
          boxShadow: "0 8px 24px rgba(25, 55, 98, 0.08)",
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontSize: 24, fontFamily: MONO, fontWeight: 800, color: C.text }}>{stock.symbol}</span>
              <span style={{ fontSize: 12, fontFamily: SANS, color: C.textSec }}>{stock.name}</span>
              <Badge color={C.textSec}>{stock.exchange}</Badge>
              <button
                onClick={() => onOpenTradingView?.(stock.symbol)}
                style={{ border: `1px solid ${C.borderLit}`, background: "#ffffff", color: C.accent, borderRadius: 4, padding: "3px 8px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
              >
                TRADINGVIEW
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 6 }}>
              <span style={{ fontSize: 30, fontFamily: MONO, fontWeight: 700, color: C.text }}>
                ${stock.price?.toFixed(2)}
              </span>
              <span style={{ fontSize: 16, fontFamily: MONO, fontWeight: 700, color: isUp ? C.green : C.red }}>
                {isUp ? "+" : ""}{chg.toFixed(2)}% ({isUp ? "+" : ""}${(stock.change || 0).toFixed(2)})
              </span>
              <TrendTag trend={trend} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                background: "#ffffff", border: `1px solid ${C.borderLit}`, color: C.text,
                fontFamily: MONO, fontSize: 11, fontWeight: 700, cursor: "pointer",
                borderRadius: 6, padding: "8px 12px",
              }}
            >
              BACK TO MONITOR
            </button>
            <button
              onClick={() => (onExit ? onExit() : onClose?.())}
              style={{
                background: "#ffffff", border: `1px solid ${C.borderLit}`, color: C.red,
                fontFamily: MONO, fontSize: 11, fontWeight: 700, cursor: "pointer",
                borderRadius: 6, padding: "8px 12px",
              }}
            >
              EXIT
            </button>
          </div>
          <button onClick={onClose} style={{
            background: "#f6f9ff", border: `1px solid ${C.borderLit}`, color: C.accent,
            fontSize: 18, cursor: "pointer", borderRadius: 6, width: 38, height: 38,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>✕</button>
        </div>

        {/* Score Bar */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10,
          padding: "12px 14px 2px",
        }}>
          {[
            { label: "COMPOSITE", val: scores.composite, col: C.accent },
            { label: "TECHNICAL", val: scores.tech, col: C.cyan },
            { label: "FUNDAMENTAL", val: scores.fund, col: C.purple },
            { label: "MACRO FIT", val: scores.macro, col: C.amber },
          ].map(s => (
            <div key={s.label} style={{ ...panelCard, borderTop: `3px solid ${s.col}`, padding: "12px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 8, fontFamily: MONO, color: C.textDim, marginBottom: 5, letterSpacing: "0.1em" }}>{s.label}</div>
              <div style={{ fontSize: 24, fontFamily: MONO, fontWeight: 800, color: s.col }}>{s.val}</div>
              <div style={{ marginTop: 5 }}><ScoreBar value={s.val} color={s.col} /></div>
            </div>
          ))}
        </div>

        {/* Data Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, padding: "10px 14px 0" }}>
          <div style={{ ...panelCard, padding: 18 }}>
            <div style={{ fontSize: 10, fontFamily: MONO, fontWeight: 800, color: C.cyan, marginBottom: 10, letterSpacing: "0.08em" }}>
              MARKET DATA
            </div>
            {[
              ["Price", `$${stock.price?.toFixed(2)}`],
              ["Day Range", `$${stock.dayLow?.toFixed(2)} — $${stock.dayHigh?.toFixed(2)}`],
              ["52W Range", `$${stock.yearLow?.toFixed(2)} — $${stock.yearHigh?.toFixed(2)}`],
              ["Volume", stock.volume?.toLocaleString()],
              ["Avg Volume", stock.avgVolume?.toLocaleString()],
              ["Rel. Volume", `${rvol}x`],
              ["Market Cap", formatNum(resolvedMarketCap)],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 10, fontFamily: SANS, color: C.textDim }}>{k}</span>
                <span style={{ fontSize: 10, fontFamily: MONO, color: C.text }}>{v || "—"}</span>
              </div>
            ))}
          </div>
          <div style={{ ...panelCard, padding: 18 }}>
            <div style={{ fontSize: 10, fontFamily: MONO, fontWeight: 800, color: C.purple, marginBottom: 10, letterSpacing: "0.08em" }}>
              VALUATION & METRICS
            </div>
            {[
              ["P/E Ratio", stock.pe?.toFixed(2)],
              ["EPS (TTM)", `$${stock.eps?.toFixed(2)}`],
              ["Shares Out", stock.sharesOutstanding ? `${(stock.sharesOutstanding / 1e9).toFixed(2)}B` : "—"],
              ["Open", `$${stock.open?.toFixed(2)}`],
              ["Prev Close", `$${stock.previousClose?.toFixed(2)}`],
              ["50D Avg", stock.priceAvg50 ? `$${stock.priceAvg50.toFixed(2)}` : "—"],
              ["200D Avg", stock.priceAvg200 ? `$${stock.priceAvg200.toFixed(2)}` : "—"],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 10, fontFamily: SANS, color: C.textDim }}>{k}</span>
                <span style={{ fontSize: 10, fontFamily: MONO, color: C.text }}>{v || "—"}</span>
              </div>
            ))}
          </div>
        </div>

        {/* EMA / Trend Analysis */}
        <div style={{ ...panelCard, margin: "12px 14px 0", padding: 18 }}>
          <div style={{ fontSize: 10, fontFamily: MONO, fontWeight: 800, color: C.accent, marginBottom: 10, letterSpacing: "0.08em" }}>
            TREND ANALYSIS
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            {[
              {
                label: "50D AVG POSITION",
                val: stock.priceAvg50 ? (stock.price > stock.priceAvg50 ? "ABOVE" : "BELOW") : "—",
                col: stock.price > (stock.priceAvg50 || 0) ? C.green : C.red,
                detail: stock.priceAvg50 ? `Price ${((stock.price / stock.priceAvg50 - 1) * 100).toFixed(1)}% from 50D` : "",
              },
              {
                label: "200D AVG POSITION",
                val: stock.priceAvg200 ? (stock.price > stock.priceAvg200 ? "ABOVE" : "BELOW") : "—",
                col: stock.price > (stock.priceAvg200 || 0) ? C.green : C.red,
                detail: stock.priceAvg200 ? `Price ${((stock.price / stock.priceAvg200 - 1) * 100).toFixed(1)}% from 200D` : "",
              },
              {
                label: "52W RANGE POSITION",
                val: stock.yearHigh && stock.yearLow
                  ? `${(((stock.price - stock.yearLow) / (stock.yearHigh - stock.yearLow)) * 100).toFixed(0)}%`
                  : "—",
                col: C.text,
                detail: stock.yearHigh ? `High $${stock.yearHigh.toFixed(2)} / Low $${stock.yearLow.toFixed(2)}` : "",
              },
            ].map(item => (
              <div key={item.label}>
                <div style={{ fontSize: 8, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em", marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 16, fontFamily: MONO, fontWeight: 800, color: item.col }}>{item.val}</div>
                <div style={{ fontSize: 9, fontFamily: SANS, color: C.textDim, marginTop: 2 }}>{item.detail}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Deep Dive Pro */}
        <div style={{ ...panelCard, margin: "12px 14px 0", padding: 18 }}>
          <div style={{ fontSize: 10, fontFamily: MONO, fontWeight: 800, color: C.green, marginBottom: 10, letterSpacing: "0.08em" }}>
            DEEP DIVE PRO
          </div>
          {(() => {
            return (
              <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
                <div style={{ ...panelCard, padding: 12 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.accent, marginBottom: 8 }}>INSTITUTIONAL READ</div>
                  <div style={{ fontSize: 12, color: C.textSec, marginBottom: 6 }}>
                    Bull case: {trendState === "Primary Uptrend" ? "Trend leadership intact with favorable structure and upside continuation potential." : "Needs reclaim of trend stack (price > 50D > 200D) before high-conviction continuation."}
                  </div>
                  <div style={{ fontSize: 12, color: C.textSec, marginBottom: 6 }}>
                    Bear case: {trendState === "Primary Downtrend" ? "Downtrend pressure remains with higher risk of lower highs and lower lows." : "Loss of 50D support can trigger fast de-risking into range lows."}
                  </div>
                  <div style={{ fontSize: 12, color: C.textSec }}>
                    Macro fit: {macroFit}. Stock likely responds more to broad risk regime than idiosyncratic catalysts in high-volatility sessions.
                  </div>
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, marginBottom: 6 }}>TECHNICAL CHECKLIST</div>
                    <div style={{ fontSize: 11, color: C.textSec, lineHeight: 1.45 }}>
                      Trend: {stock.price > (stock.priceAvg50 || 0) ? "Aligned" : "Weak"} ·
                      RVOL: {rvol}x ·
                      52W position: {stock.yearHigh && stock.yearLow ? `${(((stock.price - stock.yearLow) / Math.max(0.01, (stock.yearHigh - stock.yearLow))) * 100).toFixed(0)}%` : "n/a"}
                    </div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, marginBottom: 6 }}>FUNDAMENTAL PROXY</div>
                    <div style={{ fontSize: 11, color: C.textSec, lineHeight: 1.45 }}>
                      Market cap: {formatNum(resolvedMarketCap)} ·
                      50D vs 200D: {(stock.priceAvg50 && stock.priceAvg200 && stock.priceAvg50 > stock.priceAvg200) ? "Improving trend" : "Mixed/weak"} ·
                      Quality flag: {scores.fund >= 65 ? "Higher quality" : scores.fund >= 50 ? "Neutral quality" : "Lower quality"}
                    </div>
                  </div>
                </div>
                <div style={{ ...panelCard, padding: 12 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.accent, marginBottom: 8 }}>TRADE PLAN</div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}><span style={{ color: C.textDim }}>Setup</span><span style={{ color: setup.includes("BUY") ? C.green : setup.includes("WAIT") ? C.amber : C.red, fontFamily: MONO }}>{setup}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}><span style={{ color: C.textDim }}>Entry Zone</span><span style={{ color: C.text, fontFamily: MONO }}>${entry.toFixed(2)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}><span style={{ color: C.textDim }}>Stop</span><span style={{ color: C.red, fontFamily: MONO }}>${stop.toFixed(2)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}><span style={{ color: C.textDim }}>Target 1</span><span style={{ color: C.green, fontFamily: MONO }}>${target1.toFixed(2)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}><span style={{ color: C.textDim }}>Target 2</span><span style={{ color: C.green, fontFamily: MONO }}>${target2.toFixed(2)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}><span style={{ color: C.textDim }}>R:R</span><span style={{ color: rr >= 1.5 ? C.green : C.amber, fontFamily: MONO }}>{rr.toFixed(2)}x</span></div>
                  <div style={{ fontSize: 10, color: C.textDim, marginTop: 8 }}>
                    Invalidation: close below stop with rising volume. Position size note: risk max 0.5%–1% per trade.
                  </div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginTop: 12 }}>
                <div style={{ ...panelCard, padding: 12 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.accent, marginBottom: 6 }}>TECHNICAL INTELLIGENCE</div>
                  <div style={{ fontSize: 11, color: C.textSec, lineHeight: 1.55 }}>
                    Trend state: {trendState}<br />
                    Structure: {structureState}<br />
                    RVOL: {rvol}x<br />
                    Intraday range / ATR proxy: {atrProxyPct.toFixed(2)}%
                  </div>
                </div>
                <div style={{ ...panelCard, padding: 12 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.accent, marginBottom: 6 }}>FUNDAMENTAL SNAPSHOT</div>
                  <div style={{ fontSize: 11, color: C.textSec, lineHeight: 1.55 }}>
                Market cap: {formatNum(resolvedMarketCap)}<br />
                Valuation: {valuationState} {resolvedPe > 0 ? `(P/E ${resolvedPe.toFixed(1)})` : ""}<br />
                EPS proxy: {resolvedEps > 0 ? `$${resolvedEps.toFixed(2)}` : "Not available"}<br />
                Quality: {qualityState}
              </div>
                </div>
                <div style={{ ...panelCard, padding: 12 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.accent, marginBottom: 6 }}>SCENARIO MATRIX</div>
                  <div style={{ fontSize: 11, color: C.textSec, lineHeight: 1.55 }}>
                    Bull continuation: <span style={{ color: C.green, fontFamily: MONO }}>{bullProb}%</span><br />
                    Base consolidation: <span style={{ color: C.amber, fontFamily: MONO }}>{baseProb}%</span><br />
                    Bear breakdown: <span style={{ color: C.red, fontFamily: MONO }}>{bearProb}%</span><br />
                    Year range position: <span style={{ fontFamily: MONO }}>{yearPos.toFixed(0)}%</span>
                  </div>
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.textDim, marginBottom: 6 }}>12M PRICE ESTIMATE</div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}>
                      <span style={{ color: C.textDim }}>Bear (12m)</span>
                      <span style={{ color: C.red, fontFamily: MONO }}>${bear12m.toFixed(2)} ({downsideBearPct >= 0 ? "+" : ""}{downsideBearPct.toFixed(1)}%)</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}>
                      <span style={{ color: C.textDim }}>Base (12m)</span>
                      <span style={{ color: C.accent, fontFamily: MONO }}>${base12m.toFixed(2)} ({upsideBasePct >= 0 ? "+" : ""}{upsideBasePct.toFixed(1)}%)</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                      <span style={{ color: C.textDim }}>Bull (12m)</span>
                      <span style={{ color: C.green, fontFamily: MONO }}>${bull12m.toFixed(2)} ({upsideBullPct >= 0 ? "+" : ""}{upsideBullPct.toFixed(1)}%)</span>
                    </div>
                    <div style={{ fontSize: 10, color: C.textDim, marginTop: 6 }}>
                      Model: {estModelTag}. For decision support only.
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginTop: 12 }}>
                <div style={{ ...panelCard, padding: 12 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.accent, marginBottom: 6 }}>CATALYSTS & RISKS</div>
                  <div style={{ fontSize: 11, color: C.textSec, lineHeight: 1.55 }}>
                    Catalyst watch: {catalystNote}<br />
                    Risk flag: {riskNote}<br />
                    Confirmation needed: hold above entry zone and improve relative volume and trend quality.
                  </div>
                </div>
                <div style={{ ...panelCard, padding: 12 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.accent, marginBottom: 6 }}>POSITION SIZING NOTE</div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}><span style={{ color: C.textDim }}>Risk Budget</span><span style={{ color: C.text, fontFamily: MONO }}>${riskBudget.toFixed(0)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}><span style={{ color: C.textDim }}>Risk / Share</span><span style={{ color: C.text, fontFamily: MONO }}>${riskPerShare.toFixed(2)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}><span style={{ color: C.textDim }}>Suggested Size</span><span style={{ color: C.text, fontFamily: MONO }}>{sizeShares.toLocaleString()} sh</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span style={{ color: C.textDim }}>Position Notional</span><span style={{ color: C.text, fontFamily: MONO }}>${positionValue.toFixed(0)}</span></div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginTop: 12 }}>
                <div style={{ ...panelCard, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.cyan }}>TECHNICAL DEEP DIVE</div>
                    <Badge color={technicalDeepScore >= 70 ? C.green : technicalDeepScore >= 55 ? C.amber : C.red}>{technicalDeepScore}</Badge>
                  </div>
                  <div style={{ display: "grid", gap: 5, fontSize: 11, color: C.textSec, lineHeight: 1.45 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span>Trend Stack (9/21/50/200 proxy)</span><span style={{ fontFamily: MONO, color: techTrendScore >= 70 ? C.green : techTrendScore >= 55 ? C.amber : C.red }}>{techTrendScore}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span>Momentum (CHG% + RVOL)</span><span style={{ fontFamily: MONO, color: techMomentumScore >= 70 ? C.green : techMomentumScore >= 55 ? C.amber : C.red }}>{Math.round(techMomentumScore)}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span>Structure (52W range position)</span><span style={{ fontFamily: MONO, color: techStructureScore >= 70 ? C.green : techStructureScore >= 55 ? C.amber : C.red }}>{Math.round(techStructureScore)}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span>Volatility Efficiency</span><span style={{ fontFamily: MONO, color: techVolatilityScore >= 70 ? C.green : techVolatilityScore >= 55 ? C.amber : C.red }}>{Math.round(techVolatilityScore)}</span></div>
                  </div>
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.textDim }}>
                    Trigger quality: {technicalDeepScore >= 70 ? "Institutional-quality continuation profile." : technicalDeepScore >= 55 ? "Tradable with confirmation and tighter risk." : "Weak technical quality, avoid forcing entries."}
                  </div>
                </div>
                <div style={{ ...panelCard, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: C.purple }}>FUNDAMENTAL DEEP DIVE</div>
                    <Badge color={fundamentalDeepScore >= 70 ? C.green : fundamentalDeepScore >= 55 ? C.amber : C.red}>{fundamentalDeepScore}</Badge>
                  </div>
                  <div style={{ display: "grid", gap: 5, fontSize: 11, color: C.textSec, lineHeight: 1.45 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span>Valuation Quality</span><span style={{ fontFamily: MONO, color: fundValuationScore >= 70 ? C.green : fundValuationScore >= 55 ? C.amber : C.red }}>{fundValuationScore}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span>EPS Power (proxy)</span><span style={{ fontFamily: MONO, color: fundEpsScore >= 70 ? C.green : fundEpsScore >= 55 ? C.amber : C.red }}>{Math.round(fundEpsScore)}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span>Quality Composite</span><span style={{ fontFamily: MONO, color: fundQualityScore >= 70 ? C.green : fundQualityScore >= 55 ? C.amber : C.red }}>{fundQualityScore}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span>Durability / Scale</span><span style={{ fontFamily: MONO, color: fundDurabilityScore >= 70 ? C.green : fundDurabilityScore >= 55 ? C.amber : C.red }}>{Math.round(fundDurabilityScore)}</span></div>
                  </div>
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.textDim }}>
                    12m Base/Bull/Bear: <span style={{ fontFamily: MONO, color: C.text }}>${base12m.toFixed(2)} / ${bull12m.toFixed(2)} / ${bear12m.toFixed(2)}</span>
                  </div>
                </div>
              </div>
              </>
            );
          })()}
        </div>

        {/* Disclaimer */}
        <div style={{ margin: "12px 14px 16px", padding: "10px 18px", fontSize: 9, fontFamily: SANS, color: C.textDim, background: "#f8fbff", border: `1px solid ${C.borderLit}`, borderRadius: 8, fontStyle: "italic" }}>
          Decision support only — not financial advice. Scores are heuristic estimates. Full fundamental & macro scoring requires additional API data (income statements, macro indicators).
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [appUnlocked, setAppUnlocked] = useState(false);
  const [unlockInput, setUnlockInput] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [apiKey, setApiKey] = useState("YAHOO_LOCAL");
  const [watchlistSymbols, setWatchlistSymbols] = useState(WATCHLIST_SYMBOLS);
  const [watchlistInput, setWatchlistInput] = useState(WATCHLIST_SYMBOLS.join(","));
  const [customAlertSymbol, setCustomAlertSymbol] = useState("");
  const [customAlertMin, setCustomAlertMin] = useState("70");
  const [customAlerts, setCustomAlerts] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [providerKeys, setProviderKeys] = useState(DEFAULT_SETTINGS.providerKeys);
  const [flowFilters, setFlowFilters] = useState(DEFAULT_SETTINGS.flowFilters);
  const [riskAccount, setRiskAccount] = useState("100000");
  const [riskPct, setRiskPct] = useState("1");
  const [riskEntry, setRiskEntry] = useState("100");
  const [riskStop, setRiskStop] = useState("95");
  const [riskSide, setRiskSide] = useState("long");
  const [riskMaxPosPct, setRiskMaxPosPct] = useState("20");
  const [riskCorrCap, setRiskCorrCap] = useState("0.80");
  const [riskAtrPct, setRiskAtrPct] = useState("4.0");
  const [riskSlipBps, setRiskSlipBps] = useState("10");
  const [riskSetupQuality, setRiskSetupQuality] = useState("A");
  const [watchlistData, setWatchlistData] = useState([]);
  const [marketUniverseData, setMarketUniverseData] = useState([]);
  const [marketUniverseLoading, setMarketUniverseLoading] = useState(false);
  const [newsData, setNewsData] = useState([]);
  const [optionsFlow, setOptionsFlow] = useState(null);
  const [macroData, setMacroData] = useState([]);
  const [sectorData, setSectorData] = useState([]);
  const [selectedStock, setSelectedStock] = useState(null);
  const [terminalSymbol, setTerminalSymbol] = useState(WATCHLIST_SYMBOLS[0]);
  const [terminalTf, setTerminalTf] = useState("1D");
  const [terminalCandles, setTerminalCandles] = useState(null);
  const [terminalCandlesLoading, setTerminalCandlesLoading] = useState(false);
  const [terminalPanelSymbols, setTerminalPanelSymbols] = useState(WATCHLIST_SYMBOLS.slice(0, 4));
  const [terminalPanelCandles, setTerminalPanelCandles] = useState({});
  const [terminalFundamentals, setTerminalFundamentals] = useState(null);
  const [selectedFundamentals, setSelectedFundamentals] = useState(null);
  const [dataSourceStatus, setDataSourceStatus] = useState("connecting");
  const [terminalLayout, setTerminalLayout] = useState(DEFAULT_SETTINGS.terminalLayout);
  const [hotkeyProfile, setHotkeyProfile] = useState(DEFAULT_SETTINGS.hotkeyProfile);
  const [drawTools, setDrawTools] = useState({
    trendStart: "",
    trendEnd: "",
    fibLow: "",
    fibHigh: "",
  });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteInput, setPaletteInput] = useState("");
  const [marketReportOpen, setMarketReportOpen] = useState(false);
  const [marketReportText, setMarketReportText] = useState("");
  const [marketReportData, setMarketReportData] = useState(null);
  const [marketReportGeneratedAt, setMarketReportGeneratedAt] = useState("");
  const [weatherData, setWeatherData] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");
  const [symbolSearch, setSymbolSearch] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading, setLoading] = useState(false);
  const [portfolioHoldings, setPortfolioHoldings] = useState(DEFAULT_PORTFOLIO);
  const [scannerFilters, setScannerFilters] = useState(DEFAULT_SCANNER_FILTERS);
  const [workflowState, setWorkflowState] = useState(DEFAULT_WORKFLOW);
  const [workflowAutoPlan, setWorkflowAutoPlan] = useState(null);
  const [tvSource, setTvSource] = useState("bloomberg");
  const [backtestSymbol, setBacktestSymbol] = useState(WATCHLIST_SYMBOLS[0]);
  const [backtestTf, setBacktestTf] = useState("1D");
  const [backtestLookback, setBacktestLookback] = useState("20");
  const [backtestResult, setBacktestResult] = useState(null);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [clockNow, setClockNow] = useState(Date.now());
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState("");
  const [sortCol, setSortCol] = useState("composite");
  const [sortDir, setSortDir] = useState("desc");
  const intervalRef = useRef(null);
  const themeMode = String(settings.themeMode || "light").toLowerCase() === "dark" ? "dark" : "light";

  useEffect(() => {
    try {
      if (sessionStorage.getItem(AUTH_STORAGE_KEY) === "1") {
        setAppUnlocked(true);
      }
    } catch {}
  }, []);

  const handleUnlock = useCallback(() => {
    if (String(unlockInput || "") === APP_LOCK_PASSWORD) {
      setAppUnlocked(true);
      setUnlockError("");
      try { sessionStorage.setItem(AUTH_STORAGE_KEY, "1"); } catch {}
      return;
    }
    setUnlockError("Incorrect password");
  }, [unlockInput]);

  const handleLock = useCallback(() => {
    setAppUnlocked(false);
    setUnlockInput("");
    setUnlockError("");
    try { sessionStorage.removeItem(AUTH_STORAGE_KEY); } catch {}
  }, []);

  useEffect(() => {
    const themeObj = themeMode === "dark" ? THEME_DARK : THEME_LIGHT;
    Object.assign(C, themeObj);
    try {
      document.body.style.background = themeObj.bg;
      document.body.style.color = themeObj.text;
    } catch {}
  }, [themeMode]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (Array.isArray(saved.watchlistSymbols) && saved.watchlistSymbols.length) {
        setWatchlistSymbols(saved.watchlistSymbols);
        setWatchlistInput(saved.watchlistSymbols.join(","));
      }
      if (Array.isArray(saved.customAlerts)) setCustomAlerts(saved.customAlerts);
      if (Array.isArray(saved.portfolioHoldings) && saved.portfolioHoldings.length) {
        setPortfolioHoldings(saved.portfolioHoldings.map((h) => ({
          symbol: String(h.symbol || "").toUpperCase(),
          shares: String(h.shares || "0"),
          avgCost: String(h.avgCost || "0"),
        })));
      }
      if (saved.scannerFilters && typeof saved.scannerFilters === "object") {
        setScannerFilters({
          minPrice: String(saved.scannerFilters.minPrice || "10"),
          minChange: String(saved.scannerFilters.minChange || "0.5"),
          minRvol: String(saved.scannerFilters.minRvol || "1"),
          minScore: String(saved.scannerFilters.minScore || "55"),
          sector: String(saved.scannerFilters.sector || "ALL"),
          scope: String(saved.scannerFilters.scope || "watchlist"),
        });
      }
      if (saved.workflowState && typeof saved.workflowState === "object") {
        setWorkflowState({
          premarket: {
            checklist: Array.isArray(saved.workflowState?.premarket?.checklist) ? saved.workflowState.premarket.checklist : DEFAULT_WORKFLOW.premarket.checklist,
            notes: String(saved.workflowState?.premarket?.notes || ""),
          },
          live: {
            checklist: Array.isArray(saved.workflowState?.live?.checklist) ? saved.workflowState.live.checklist : DEFAULT_WORKFLOW.live.checklist,
            notes: String(saved.workflowState?.live?.notes || ""),
          },
          postmarket: {
            checklist: Array.isArray(saved.workflowState?.postmarket?.checklist) ? saved.workflowState.postmarket.checklist : DEFAULT_WORKFLOW.postmarket.checklist,
            notes: String(saved.workflowState?.postmarket?.notes || ""),
          },
        });
      }
      if (saved.settings && typeof saved.settings === "object") {
        setSettings({ ...DEFAULT_SETTINGS, ...saved.settings });
        if (saved.settings.terminalLayout) setTerminalLayout(String(saved.settings.terminalLayout));
        if (saved.settings.hotkeyProfile) setHotkeyProfile(String(saved.settings.hotkeyProfile));
        if (saved.settings.providerKeys && typeof saved.settings.providerKeys === "object") {
          setProviderKeys({
            finnhubKey: String(saved.settings.providerKeys.finnhubKey || ""),
            fmpKey: String(saved.settings.providerKeys.fmpKey || ""),
            polygonKey: String(saved.settings.providerKeys.polygonKey || ""),
            uwKey: String(saved.settings.providerKeys.uwKey || ""),
            tradierKey: String(saved.settings.providerKeys.tradierKey || ""),
          });
        }
        if (saved.settings.flowFilters && typeof saved.settings.flowFilters === "object") {
          setFlowFilters({
            flowType: String(saved.settings.flowFilters.flowType || "all"),
            minNotional: String(saved.settings.flowFilters.minNotional || "0"),
            unusualOnly: Boolean(saved.settings.flowFilters.unusualOnly),
            autoAlertNotional: String(saved.settings.flowFilters.autoAlertNotional || "250000"),
          });
        }
      }
      if (saved.riskSettings && typeof saved.riskSettings === "object") {
        setRiskAccount(String(saved.riskSettings.riskAccount || "100000"));
        setRiskPct(String(saved.riskSettings.riskPct || "1"));
        setRiskEntry(String(saved.riskSettings.riskEntry || "100"));
        setRiskStop(String(saved.riskSettings.riskStop || "95"));
        setRiskSide(String(saved.riskSettings.riskSide || "long"));
        setRiskMaxPosPct(String(saved.riskSettings.riskMaxPosPct || "20"));
        setRiskCorrCap(String(saved.riskSettings.riskCorrCap || "0.80"));
        setRiskAtrPct(String(saved.riskSettings.riskAtrPct || "4.0"));
        setRiskSlipBps(String(saved.riskSettings.riskSlipBps || "10"));
        setRiskSetupQuality(String(saved.riskSettings.riskSetupQuality || "A"));
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        watchlistSymbols,
        customAlerts,
        portfolioHoldings,
        scannerFilters,
        workflowState,
        settings: { ...settings, terminalLayout, hotkeyProfile, providerKeys, flowFilters },
        riskSettings: {
          riskAccount, riskPct, riskEntry, riskStop, riskSide,
          riskMaxPosPct, riskCorrCap, riskAtrPct, riskSlipBps, riskSetupQuality,
        },
      }));
    } catch {}
  }, [watchlistSymbols, customAlerts, portfolioHoldings, scannerFilters, workflowState, settings, terminalLayout, hotkeyProfile, providerKeys, flowFilters, riskAccount, riskPct, riskEntry, riskStop, riskSide, riskMaxPosPct, riskCorrCap, riskAtrPct, riskSlipBps, riskSetupQuality]);

  useEffect(() => {
    const t = setInterval(() => setClockNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!watchlistSymbols.length) return;
    if (!watchlistSymbols.includes(terminalSymbol)) {
      setTerminalSymbol(watchlistSymbols[0]);
    }
  }, [watchlistSymbols, terminalSymbol]);

  useEffect(() => {
    if (!watchlistSymbols.length) return;
    setTerminalPanelSymbols((prev) => {
      const seed = [terminalSymbol, ...prev, ...watchlistSymbols].filter(Boolean);
      const uniq = Array.from(new Set(seed)).slice(0, 4);
      while (uniq.length < 4) uniq.push(watchlistSymbols[0]);
      return uniq;
    });
  }, [watchlistSymbols, terminalSymbol]);

  useEffect(() => {
    let cancelled = false;
    if (!apiKey || !terminalSymbol) return;
    setTerminalCandlesLoading(true);
    fetchCandles(terminalSymbol, terminalTf)
      .then((data) => {
        if (!cancelled) setTerminalCandles(data);
      })
      .catch(() => {
        if (!cancelled) setTerminalCandles(null);
      })
      .finally(() => {
        if (!cancelled) setTerminalCandlesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey, terminalSymbol, terminalTf]);

  useEffect(() => {
    let cancelled = false;
    if (!apiKey) return;
    const panelCount = terminalLayout === "4" ? 4 : terminalLayout === "2" ? 2 : 1;
    const symbols = terminalPanelSymbols.slice(0, panelCount).filter(Boolean);
    if (!symbols.length) return;
    Promise.all(symbols.map((s) => fetchCandles(s, terminalTf).catch(() => null)))
      .then((rows) => {
        if (cancelled) return;
        const map = {};
        rows.forEach((r, idx) => {
          if (r && symbols[idx]) map[symbols[idx]] = r;
        });
        setTerminalPanelCandles(map);
      });
    return () => { cancelled = true; };
  }, [apiKey, terminalPanelSymbols, terminalLayout, terminalTf]);

  useEffect(() => {
    let cancelled = false;
    if (!apiKey || !terminalSymbol) return;
    fetchFundamentals(terminalSymbol, providerKeys)
      .then((f) => {
        if (!cancelled) setTerminalFundamentals(f || null);
      })
      .catch(() => {
        if (!cancelled) setTerminalFundamentals(null);
      });
    return () => { cancelled = true; };
  }, [apiKey, terminalSymbol, providerKeys]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedStock?.symbol) {
      setSelectedFundamentals(null);
      return () => { cancelled = true; };
    }
    fetchFundamentals(selectedStock.symbol, providerKeys)
      .then((f) => {
        if (!cancelled) setSelectedFundamentals(f || null);
      })
      .catch(() => {
        if (!cancelled) setSelectedFundamentals(null);
      });
    return () => { cancelled = true; };
  }, [selectedStock?.symbol, providerKeys]);

  const runPaletteCommand = useCallback((raw) => {
    const q = String(raw || "").trim().toUpperCase();
    if (!q) return;

    const normalized = q.replace(/\s*(<GO>|GO)\s*$/, "").trim();
    const toTab = {
      MONITOR: "dashboard",
      DASHBOARD: "dashboard",
      TERMINAL: "terminal",
      MACRO: "macro",
      NEWS: "news",
      TV: "tv",
      LIVETV: "tv",
      ALERTS: "alerts",
      WORKFLOW: "workflow",
      FLOW: "flow",
      PORTFOLIO: "portfolio",
      SCANNER: "scanner",
      BACKTEST: "backtest",
      ROTATION: "rotation",
      TOOLS: "tools",
      SECTORS: "sectors",
    };

    if (toTab[normalized]) {
      setActiveTab(toTab[normalized]);
      return;
    }

    if (normalized.startsWith("TF ")) {
      const tf = normalized.replace("TF ", "").trim();
      if (["5M", "15M", "1H", "1D", "1W"].includes(tf)) {
        setActiveTab("terminal");
        setTerminalTf(tf);
      }
      return;
    }

    if (normalized.startsWith("LAYOUT ")) {
      const l = normalized.replace("LAYOUT ", "").trim();
      if (["1", "2", "4"].includes(l)) {
        setActiveTab("terminal");
        setTerminalLayout(l);
      }
      return;
    }

    const maybeSymbol = normalized.split(" ")[0];
    if (/^[A-Z.\-]{1,10}$/.test(maybeSymbol)) {
      setTerminalSymbol(maybeSymbol);
      if (!watchlistSymbols.includes(maybeSymbol)) {
        const next = [...watchlistSymbols, maybeSymbol];
        setWatchlistSymbols(next);
        setWatchlistInput(next.join(","));
      }
      setActiveTab("terminal");
    }
  }, [watchlistSymbols, setWatchlistSymbols, setWatchlistInput, setTerminalLayout]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
      } else if (!paletteOpen && e.key === "/") {
        const t = e.target;
        const tag = t?.tagName?.toLowerCase();
        if (tag !== "input" && tag !== "textarea") {
          e.preventDefault();
          setPaletteOpen(true);
        }
      }

      if (activeTab === "terminal" && !paletteOpen && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const key = e.key.toLowerCase();
        const tfByProfile = hotkeyProfile === "scalper"
          ? { z: "5M", x: "15M", c: "1H", v: "1D", b: "1W" }
          : { q: "5M", w: "15M", e: "1H", r: "1D", t: "1W" };
        if (tfByProfile[key]) {
          setTerminalTf(tfByProfile[key]);
        }
        if (key === "1") setTerminalLayout("1");
        if (key === "2") setTerminalLayout("2");
        if (key === "4") setTerminalLayout("4");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [paletteOpen, activeTab, hotkeyProfile]);

  const fetchAll = useCallback(async (key) => {
    setError("");
    setDataSourceStatus("updating");

    let hardError = "";
    let wl = [];

    try {
      wl = await withClientTimeout(fetchQuotes(watchlistSymbols, providerKeys), 25000, []);
      if (Array.isArray(wl) && wl.length > 0) setWatchlistData(wl);
      else wl = [];
    } catch (e) {
      hardError = `Quotes unavailable: ${e?.message || "unknown error"}`;
    }

    if (!wl || wl.length === 0) {
      setWatchlistData((prev) => (Array.isArray(prev) && prev.length > 0 ? prev : buildPlaceholderQuotes(watchlistSymbols)));
    }

    try {
      const macroSyms = MACRO_SYMBOLS.filter(m => m.type !== "crypto").map(m => m.symbol);
      const macroQ = await withClientTimeout(fetchQuotes(macroSyms, providerKeys), 14000, []);
      let cryptoQ = [];
      try { cryptoQ = await withClientTimeout(fetchCryptoQuotes(providerKeys), 8000, []); } catch {}
      const combined = [...(Array.isArray(macroQ) ? macroQ : []), ...(Array.isArray(cryptoQ) ? cryptoQ : [])];
      combined.forEach(q => {
        const def = MACRO_SYMBOLS.find(m => m.symbol === q.symbol);
        if (def) q._label = def.label;
      });
      setMacroData(combined);
    } catch {}

    try {
      const sectorSyms = SECTOR_ETFS.map(s => s.symbol);
      const sectorQ = await withClientTimeout(fetchQuotes(sectorSyms, providerKeys), 14000, []);
      if (Array.isArray(sectorQ)) {
        sectorQ.forEach(q => {
          const def = SECTOR_ETFS.find(s => s.symbol === q.symbol);
          if (def) q._sectorName = def.name;
        });
        setSectorData(sectorQ);
      }
    } catch {}

    try {
      const newsTickers = [...(wl || [])]
        .sort((a, b) => Math.abs(b.changesPercentage || 0) - Math.abs(a.changesPercentage || 0))
        .slice(0, 6)
        .map((q) => q.symbol);
      const headlines = await withClientTimeout(
        fetchNews(newsTickers.length ? newsTickers : watchlistSymbols.slice(0, 6), 24, providerKeys),
        5000,
        []
      );
      setNewsData(Array.isArray(headlines) ? headlines : []);
    } catch {}

    try {
      const flowSymbols = (wl?.length ? wl : watchlistSymbols.map((symbol) => ({ symbol })))
        .slice(0, 8)
        .map((row) => row.symbol)
        .filter(Boolean);
      const flow = await withClientTimeout(fetchOptionsFlow(flowSymbols, 28, providerKeys, flowFilters), 20000, null);
      setOptionsFlow(flow && typeof flow === "object" ? flow : null);
    } catch {}

    setLastUpdate(new Date());
    if (Array.isArray(wl) && wl.length > 0) {
      setDataSourceStatus(hardError ? "degraded" : "live");
      if (hardError) setError(hardError);
    } else {
      setDataSourceStatus("degraded");
      setError(hardError || "Data fetch warning: no live quotes returned (use Finnhub/FMP keys in Tools).");
    }
  }, [watchlistSymbols, providerKeys, flowFilters]);

  const handleApiKey = useCallback((key) => {
    setApiKey(key || "YAHOO_LOCAL");
    setLoading(true);
    fetchAll(key).finally(() => setLoading(false));

    // Auto-refresh from user settings (stored locally)
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => fetchAll(key), settings.refreshMs);
  }, [fetchAll, settings.refreshMs]);

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  // Sorting
  const sorted = useMemo(() => {
    return [...watchlistData].sort((a, b) => {
      let va, vb;
      const scA = computeScores(a);
      const scB = computeScores(b);
      switch (sortCol) {
        case "symbol": return sortDir === "asc" ? a.symbol.localeCompare(b.symbol) : b.symbol.localeCompare(a.symbol);
        case "price": va = a.price; vb = b.price; break;
        case "change": va = a.changesPercentage || 0; vb = b.changesPercentage || 0; break;
        case "volume": va = a.volume || 0; vb = b.volume || 0; break;
        case "rvol": va = a.avgVolume ? a.volume / a.avgVolume : 0; vb = b.avgVolume ? b.volume / b.avgVolume : 0; break;
        case "mktcap": va = a.marketCap || 0; vb = b.marketCap || 0; break;
        case "composite": va = scA.composite; vb = scB.composite; break;
        case "tech": va = scA.tech; vb = scB.tech; break;
        case "fund": va = scA.fund; vb = scB.fund; break;
        default: va = scA.composite; vb = scB.composite;
      }
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [watchlistData, sortCol, sortDir]);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const handleSymbolSearch = useCallback(() => {
    const symbol = symbolSearch.trim().toUpperCase();
    if (!symbol) return;
    if (!/^[A-Z.\-]{1,10}$/.test(symbol)) return;
    if (!watchlistSymbols.includes(symbol)) {
      const next = [symbol, ...watchlistSymbols].slice(0, 30);
      setWatchlistSymbols(next);
      setWatchlistInput(next.join(","));
    }
    setTerminalSymbol(symbol);
    setActiveTab("terminal");
    setSymbolSearch("");
    setLoading(true);
    fetchAll(apiKey).finally(() => setLoading(false));
  }, [symbolSearch, watchlistSymbols, apiKey, fetchAll]);
  const openTradingView = useCallback((symbol) => {
    const url = getTradingViewUrl(symbol);
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {}
  }, []);
  const fetchWeather = useCallback(async () => {
    setWeatherLoading(true);
    setWeatherError("");
    try {
      const geoResp = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(WEATHER_ZIP)}&count=1&language=en&format=json`);
      if (!geoResp.ok) throw new Error("geocode failed");
      const geo = await geoResp.json();
      const place = Array.isArray(geo?.results) && geo.results.length ? geo.results[0] : null;
      if (!place) throw new Error("zip not found");
      const lat = Number(place.latitude);
      const lon = Number(place.longitude);

      const wResp = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,precipitation,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`
      );
      if (!wResp.ok) throw new Error("weather failed");
      const w = await wResp.json();
      setWeatherData({
        location: `${place.name || "45014"}, ${place.admin1 || ""}`.replace(/,\s*$/, ""),
        temp: Number(w?.current?.temperature_2m || 0),
        feelsLike: Number(w?.current?.apparent_temperature || 0),
        humidity: Number(w?.current?.relative_humidity_2m || 0),
        wind: Number(w?.current?.wind_speed_10m || 0),
        precip: Number(w?.current?.precipitation || 0),
        code: Number(w?.current?.weather_code || 0),
        high: Number(w?.daily?.temperature_2m_max?.[0] || 0),
        low: Number(w?.daily?.temperature_2m_min?.[0] || 0),
        rainChance: Number(w?.daily?.precipitation_probability_max?.[0] || 0),
        updatedAt: new Date().toLocaleTimeString(),
      });
    } catch {
      setWeatherError("Weather data unavailable right now.");
    } finally {
      setWeatherLoading(false);
    }
  }, []);
  const loadMarketUniverse = useCallback(async () => {
    setMarketUniverseLoading(true);
    try {
      const rows = await withClientTimeout(fetchQuotesChunked(MARKET_UNIVERSE_SYMBOLS, providerKeys, 30), 30000, []);
      if (Array.isArray(rows) && rows.length) {
        setMarketUniverseData(rows);
        return rows;
      }
      return [];
    } catch {
      setMarketUniverseData([]);
      return [];
    } finally {
      setMarketUniverseLoading(false);
    }
  }, [providerKeys]);
  useEffect(() => {
    fetchWeather();
    const t = setInterval(fetchWeather, 20 * 60 * 1000);
    return () => clearInterval(t);
  }, [fetchWeather]);
  const runBacktest = useCallback(async () => {
    const symbol = backtestSymbol.trim().toUpperCase();
    if (!symbol) return;
    setBacktestLoading(true);
    try {
      const data = await fetchCandles(symbol, backtestTf);
      const bars = Array.isArray(data?.bars) ? data.bars : [];
      const lookback = Math.max(5, Math.min(80, Number(backtestLookback || 20)));
      if (bars.length < lookback + 15) {
        setBacktestResult({ error: "Not enough candle history for this timeframe." });
        return;
      }
      const trades = [];
      let equity = 1;
      let peak = 1;
      let maxDrawdown = 0;
      const maxHoldBars = 12;
      for (let i = lookback; i < bars.length - 2; i += 1) {
        const b = bars[i];
        const prevHigh = Math.max(...bars.slice(i - lookback, i).map((x) => Number(x.high || 0)));
        const entry = Number(b.close || 0);
        if (entry <= 0 || entry <= prevHigh) continue;
        const stop = entry * 0.96;
        const target = entry + (entry - stop) * 2;
        let exit = entry;
        let outcome = "open";
        for (let j = i + 1; j < Math.min(bars.length, i + 1 + maxHoldBars); j += 1) {
          const n = bars[j];
          const hitStop = Number(n.low || 0) <= stop;
          const hitTarget = Number(n.high || 0) >= target;
          if (hitStop && hitTarget) {
            exit = stop;
            outcome = "stop";
            break;
          }
          if (hitStop) {
            exit = stop;
            outcome = "stop";
            break;
          }
          if (hitTarget) {
            exit = target;
            outcome = "target";
            break;
          }
          exit = Number(n.close || exit);
          outcome = "time";
        }
        const retPct = ((exit - entry) / entry) * 100;
        trades.push({
          date: b.time || b.date || "",
          entry,
          stop,
          target,
          exit,
          retPct,
          outcome,
        });
        equity *= (1 + retPct / 100);
        peak = Math.max(peak, equity);
        const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
        maxDrawdown = Math.max(maxDrawdown, dd);
      }
      const wins = trades.filter((t) => t.retPct > 0).length;
      const losses = trades.filter((t) => t.retPct <= 0).length;
      const avgRet = trades.length ? trades.reduce((s, t) => s + t.retPct, 0) / trades.length : 0;
      setBacktestResult({
        symbol,
        timeframe: backtestTf,
        lookback,
        totalTrades: trades.length,
        wins,
        losses,
        winRate: trades.length ? (wins / trades.length) * 100 : 0,
        avgRet,
        expectancy: avgRet,
        netRet: (equity - 1) * 100,
        maxDrawdown,
        trades: trades.slice(-12).reverse(),
      });
    } catch (e) {
      setBacktestResult({ error: e?.message || "Backtest failed." });
    } finally {
      setBacktestLoading(false);
    }
  }, [backtestSymbol, backtestTf, backtestLookback]);
  const updateWorkflowCheck = useCallback((section, id, done) => {
    setWorkflowState((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        checklist: prev[section].checklist.map((item) => item.id === id ? { ...item, done } : item),
      },
    }));
  }, []);
  const updateWorkflowNotes = useCallback((section, notes) => {
    setWorkflowState((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        notes,
      },
    }));
  }, []);
  const workflowProgress = useMemo(() => {
    const calc = (section) => {
      const list = workflowState?.[section]?.checklist || [];
      const done = list.filter((x) => x.done).length;
      return { done, total: list.length, pct: list.length ? (done / list.length) * 100 : 0 };
    };
    return {
      premarket: calc("premarket"),
      live: calc("live"),
      postmarket: calc("postmarket"),
    };
  }, [workflowState]);

  const regime = useMemo(() => classifyRegime(macroData), [macroData]);
  const alerts = useMemo(
    () => buildAlerts({ watchlist: watchlistData, macro: macroData, regime, sectorData, customAlerts }),
    [watchlistData, macroData, regime, sectorData, customAlerts]
  );
  const macroTone = useMemo(() => classifyMacroTone(macroData), [macroData]);
  const rotationRank = useMemo(() => {
    const spy = macroData.find((q) => q.symbol === "SPY")?.changesPercentage || 0;
    return [...watchlistData]
      .map((q) => ({
        ...q,
        sectorEtf: STOCK_TO_SECTOR[q.symbol] || "",
        relVsSector: (q.changesPercentage || 0) - ((sectorData.find((s) => s.symbol === (STOCK_TO_SECTOR[q.symbol] || ""))?.changesPercentage) || 0),
        relVsSpy: (q.changesPercentage || 0) - spy,
        rvol: q.avgVolume ? q.volume / q.avgVolume : 0,
      }))
      .sort((a, b) => (b.relVsSpy * 0.5 + b.relVsSector * 0.6 + b.rvol * 1.2) - (a.relVsSpy * 0.5 + a.relVsSector * 0.6 + a.rvol * 1.2));
  }, [watchlistData, macroData, sectorData]);
  const scannerRank = useMemo(() => {
    const spy = macroData.find((q) => q.symbol === "SPY")?.changesPercentage || 0;
    return [...watchlistData]
      .map((q) => {
        const rvol = q.avgVolume ? q.volume / q.avgVolume : 0;
        const rel = (q.changesPercentage || 0) - spy;
        const score = (q.delta5m || 0) * 5 + (q.delta30m || 0) * 2 + rel * 2 + rvol * 12;
        return { ...q, rvol, rel, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }, [watchlistData, macroData]);
  const scannerRows = useMemo(() => {
    const sourceRows = scannerFilters.scope === "market" ? marketUniverseData : watchlistData;
    const minPrice = Number(scannerFilters.minPrice || 0);
    const minChange = Number(scannerFilters.minChange || 0);
    const minRvol = Number(scannerFilters.minRvol || 0);
    const minScore = Number(scannerFilters.minScore || 0);
    const sector = scannerFilters.sector || "ALL";
    return sourceRows
      .map((q) => {
        const scores = computeScores(q);
        const rvol = q.avgVolume ? q.volume / q.avgVolume : 0;
        const sectorEtf = STOCK_TO_SECTOR[q.symbol] || "";
        return {
          ...q,
          scannerScore: scores.composite,
          scannerTech: scores.tech,
          scannerFund: scores.fund,
          rvol,
          sectorEtf,
        };
      })
      .filter((q) => q.price >= minPrice)
      .filter((q) => Math.abs(q.changesPercentage || 0) >= minChange)
      .filter((q) => q.rvol >= minRvol)
      .filter((q) => q.scannerScore >= minScore)
      .filter((q) => sector === "ALL" || q.sectorEtf === sector)
      .sort((a, b) => b.scannerScore - a.scannerScore);
  }, [watchlistData, marketUniverseData, scannerFilters]);
  const marketSession = useMemo(() => getMarketSessionET(new Date()), [lastUpdate, loading]);
  const newsIntel = useMemo(() => analyzeNewsIntelligence(newsData), [newsData]);
  const macroEventCalendar = useMemo(() => buildMacroEventCalendarV2(new Date(clockNow)), [clockNow]);
  const econCalendarView = String(settings.econCalendarView || "today");
  const econCalendarRegion = String(settings.econCalendarRegion || "US");
  const econAutoRisk30m = settings.econAutoRisk30m !== false;
  const econCalendarRows = useMemo(() => {
    const windowMs = econCalendarView === "week" ? (7 * 24 * 60 * 60 * 1000) : (24 * 60 * 60 * 1000);
    return (macroEventCalendar || [])
      .filter((e) => econCalendarRegion === "GLOBAL" ? true : String(e.region || "US") === "US")
      .filter((e) => e.phase === "live" || e.tteMs <= windowMs)
      .slice(0, econCalendarView === "week" ? 8 : 4);
  }, [macroEventCalendar, econCalendarView, econCalendarRegion]);
  const macroEventAlerts = useMemo(() => {
    return (macroEventCalendar || [])
      .filter((e) => !(econAutoRisk30m && e.severity === "high" && e.tteMs <= 30 * 60 * 1000 && e.tteMs >= 0))
      .filter((e) => e.tteMs <= 3 * 60 * 60 * 1000 && e.tteMs >= -30 * 60 * 1000)
      .map((e) => {
        const mins = Math.floor(Math.max(0, e.tteMs) / 60000);
        const score = e.phase === "imminent" || e.phase === "live" ? 94 : e.phase === "near" ? 86 : 74;
        const text = e.phase === "live"
          ? `${e.title} now live. Reduce risk / avoid fresh high-beta entries until post-release trend forms.`
          : `${e.title} in ${mins}m. ${e.riskNote}`;
        return {
          symbol: "MKT",
          type: "risk",
          category: "macro-event",
          score,
          text,
        };
      });
  }, [macroEventCalendar, econAutoRisk30m]);
  const econAutoRiskAlerts = useMemo(() => {
    if (!econAutoRisk30m) return [];
    return (macroEventCalendar || [])
      .filter((e) => e.severity === "high" && e.tteMs <= 30 * 60 * 1000 && e.tteMs >= 0)
      .map((e) => ({
        symbol: "MKT",
        type: "risk",
        category: "event-risk-auto",
        score: 97,
        text: `Auto risk action: ${e.title} in ${Math.max(0, Math.floor(e.tteMs / 60000))}m. Reduce risk now (trim size, tighten stops, avoid new high-beta entries).`,
      }));
  }, [macroEventCalendar, econAutoRisk30m]);
  const sessionMovers = useMemo(() => {
    const src = scannerFilters.scope === "market" && marketUniverseData.length ? marketUniverseData : watchlistData;
    const rows = [...(src || [])].filter((q) => Number(q.price || 0) > 0);
    const gainers = rows.sort((a, b) => (b.changesPercentage || 0) - (a.changesPercentage || 0)).slice(0, 5);
    const losers = [...rows].sort((a, b) => (a.changesPercentage || 0) - (b.changesPercentage || 0)).slice(0, 5);
    return { gainers, losers };
  }, [watchlistData, marketUniverseData, scannerFilters.scope]);
  const macroSignalFlags = useMemo(() => {
    const vix = Number(macroData.find((m) => m.symbol === "VIXY")?.changesPercentage || 0);
    const spy = Number(macroData.find((m) => m.symbol === "SPY")?.changesPercentage || 0);
    const uup = Number(macroData.find((m) => m.symbol === "UUP")?.changesPercentage || 0);
    const uso = Number(macroData.find((m) => m.symbol === "USO")?.changesPercentage || 0);
    const red = [];
    const green = [];
    if (vix > 2) red.push(`Volatility pressure (VIX proxy +${vix.toFixed(2)}%)`);
    if (spy < -0.5) red.push(`Index weakness (SPY ${spy.toFixed(2)}%)`);
    if (uup > 0.4) red.push(`Dollar strength headwind (${uup.toFixed(2)}%)`);
    if (uso > 1.2) red.push(`Oil inflation risk (${uso.toFixed(2)}%)`);
    if (spy > 0.7) green.push(`Risk appetite healthy (SPY +${spy.toFixed(2)}%)`);
    if (vix < -1.5) green.push(`Volatility easing (${vix.toFixed(2)}%)`);
    if (uup < -0.3) green.push(`Dollar easing (${uup.toFixed(2)}%)`);
    if (uso < -1) green.push(`Oil pressure cooling (${uso.toFixed(2)}%)`);
    return { red, green };
  }, [macroData]);
  const cryptoSnapshot = useMemo(() => {
    const btc = Number(macroData.find((m) => m.symbol === "BTCUSD")?.price || 0);
    const eth = Number(macroData.find((m) => m.symbol === "ETHUSD")?.price || 0);
    const sol = Number(macroData.find((m) => m.symbol === "SOLUSD")?.price || 0);
    const btcChg = Number(macroData.find((m) => m.symbol === "BTCUSD")?.changesPercentage || 0);
    const ethChg = Number(macroData.find((m) => m.symbol === "ETHUSD")?.changesPercentage || 0);
    const solChg = Number(macroData.find((m) => m.symbol === "SOLUSD")?.changesPercentage || 0);
    const denom = btc + eth + sol;
    const btcDomProxy = denom > 0 ? (btc / denom) * 100 : 0;
    const altStrength = ((ethChg + solChg) / 2) - btcChg;
    return { btc, eth, sol, btcChg, ethChg, solChg, btcDomProxy, altStrength };
  }, [macroData]);
  const portfolioRows = useMemo(() => {
    return portfolioHoldings
      .map((h, idx) => {
        const symbol = String(h.symbol || "").toUpperCase();
        const shares = Number(h.shares || 0);
        const avgCost = Number(h.avgCost || 0);
        const live = watchlistData.find((q) => q.symbol === symbol) || null;
        const price = Number(live?.price || 0);
        const marketValue = shares * price;
        const costBasis = shares * avgCost;
        const pnl = marketValue - costBasis;
        const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
        return { idx, symbol, shares, avgCost, live, marketValue, costBasis, pnl, pnlPct };
      })
      .filter((r) => r.symbol);
  }, [portfolioHoldings, watchlistData]);
  const portfolioSummary = useMemo(() => {
    const totalValue = portfolioRows.reduce((sum, r) => sum + r.marketValue, 0);
    const totalCost = portfolioRows.reduce((sum, r) => sum + r.costBasis, 0);
    const totalPnl = totalValue - totalCost;
    const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
    const winners = portfolioRows.filter((r) => r.pnl >= 0).length;
    const losers = portfolioRows.filter((r) => r.pnl < 0).length;
    return { totalValue, totalCost, totalPnl, totalPnlPct, winners, losers };
  }, [portfolioRows]);
  const flowRows = Array.isArray(optionsFlow?.flow) ? optionsFlow.flow : [];
  const flowBySymbol = Array.isArray(optionsFlow?.bySymbol) ? optionsFlow.bySymbol : [];
  const flowCallNotional = Number(optionsFlow?.summary?.callNotional || 0);
  const flowPutNotional = Number(optionsFlow?.summary?.putNotional || 0);
  const flowBias = flowCallNotional > flowPutNotional ? "CALL BIAS" : flowPutNotional > flowCallNotional ? "PUT BIAS" : "NEUTRAL";
  const flowAlerts = useMemo(() => {
    const threshold = Math.max(0, Number(flowFilters.autoAlertNotional || 250000));
    return flowRows
      .filter((row) => Number(row.notional || 0) >= threshold)
      .slice(0, 6)
      .map((row) => ({
        symbol: row.symbol,
        type: "flow",
        score: Math.min(99, Math.max(60, Math.round((Number(row.notional || 0) / Math.max(threshold, 1)) * 60))),
        text: `${row.tradeType} ${row.side} flow ${formatNum(row.notional || 0)} at ${row.strike} (${row.expiry || "near-term"})`,
        category: row.tradeType === "DARKPOOL" ? "dark-pool" : row.tradeType === "SWEEP" ? "sweep" : "flow-spike",
      }));
  }, [flowRows, flowFilters.autoAlertNotional]);
  const combinedAlerts = useMemo(
    () => [...econAutoRiskAlerts, ...macroEventAlerts, ...alerts, ...flowAlerts].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 12),
    [econAutoRiskAlerts, macroEventAlerts, alerts, flowAlerts]
  );
  const topHeadlineTape = useMemo(() => {
    const alertItems = (combinedAlerts || []).slice(0, 8).map((a) => ({
      kind: "ALERT",
      symbol: a.symbol,
      text: `${a.symbol} ${String(a.type || "").toUpperCase()} ${a.text}`,
      tone: a.type === "risk" ? "red" : a.type === "flow" ? "amber" : "green",
    }));
    const newsItems = (newsData || []).slice(0, 10).map((n) => {
      const t = String(n?.title || "");
      const s = String(n?.ticker || "");
      const l = t.toLowerCase();
      const isUp = l.includes("upgrade") || l.includes("raises target") || l.includes("buy rating") || l.includes("outperform");
      const isDown = l.includes("downgrade") || l.includes("cuts target") || l.includes("sell rating") || l.includes("underperform");
      return {
        kind: isUp ? "UPGRADE" : isDown ? "DOWNGRADE" : "NEWS",
        symbol: s || "MKT",
        text: `${s ? `${s} ` : ""}${t}`,
        tone: isUp ? "green" : isDown ? "red" : "accent",
      };
    });
    const all = [...alertItems, ...newsItems];
    return all.length ? all : [{ kind: "INFO", symbol: "MKT", text: "Waiting for alerts/news flow...", tone: "accent" }];
  }, [combinedAlerts, newsData]);
  const selectedTvSource = useMemo(
    () => LIVE_TV_SOURCES.find((s) => s.id === tvSource) || LIVE_TV_SOURCES[0],
    [tvSource]
  );
  const generateMarketReport = useCallback(async () => {
    const nowLabel = new Date().toLocaleString();
    const getMacro = (sym) => macroData.find((m) => m.symbol === sym) || null;
    const spy = getMacro("SPY");
    const qqq = getMacro("QQQ");
    const iwm = getMacro("IWM");
    const vix = getMacro("VIXY");
    const usd = getMacro("UUP");
    const oil = getMacro("USO");
    const btc = getMacro("BTCUSD");

    const wl = [...(watchlistData || [])].filter((q) => Number(q.price || 0) > 0);
    const advancers = wl.filter((q) => Number(q.changesPercentage || 0) > 0).length;
    const decliners = wl.filter((q) => Number(q.changesPercentage || 0) < 0).length;
    const breadthPct = wl.length ? Math.round((advancers / wl.length) * 100) : 0;
    const topGainers = [...wl].sort((a, b) => Number(b.changesPercentage || 0) - Number(a.changesPercentage || 0)).slice(0, 5);
    const topLosers = [...wl].sort((a, b) => Number(a.changesPercentage || 0) - Number(b.changesPercentage || 0)).slice(0, 3);

    const sectors = [...(sectorData || [])];
    const sectorLeaders = sectors.sort((a, b) => Number(b.changesPercentage || 0) - Number(a.changesPercentage || 0)).slice(0, 3);
    const sectorLaggers = [...sectors].sort((a, b) => Number(a.changesPercentage || 0) - Number(b.changesPercentage || 0)).slice(0, 3);

    const priAlerts = [...(combinedAlerts || [])].slice(0, 5);
    const headlines = [...(newsData || [])].slice(0, 5);
    const earningsFocusSymbols = [...new Set([
      ...topGainers.map((q) => q.symbol),
      ...topLosers.map((q) => q.symbol),
      ...rotationRank.slice(0, 5).map((q) => q.symbol),
    ].filter(Boolean))].slice(0, 10);

    const earningsWatchRaw = await Promise.all(earningsFocusSymbols.map(async (symbol) => {
      const wlRow = wl.find((q) => q.symbol === symbol);
      let earningsDate = wlRow?.earningsDate || null;
      if (!earningsDate) {
        try {
          const f = await withClientTimeout(fetchFundamentals(symbol, providerKeys), 5000, null);
          earningsDate = f?.earningsDate || null;
        } catch {}
      }

      const eventTs = earningsDate ? new Date(earningsDate).getTime() : NaN;
      const validDate = Number.isFinite(eventTs);
      const now = new Date();
      const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const eventStart = validDate ? new Date(new Date(eventTs).getFullYear(), new Date(eventTs).getMonth(), new Date(eventTs).getDate()).getTime() : NaN;
      const dayDiff = validDate ? Math.round((eventStart - nowStart) / (24 * 60 * 60 * 1000)) : null;
      const timing = dayDiff == null
        ? "TBD"
        : dayDiff === 0
        ? "TODAY"
        : dayDiff === 1
        ? "TOMORROW"
        : dayDiff > 1
        ? `IN ${dayDiff}D`
        : `${Math.abs(dayDiff)}D AGO`;

      return {
        symbol,
        earningsDate: validDate ? new Date(eventTs).toISOString() : null,
        dayDiff,
        timing,
      };
    }));
    const earningsWatch = earningsWatchRaw
      .sort((a, b) => {
        const av = a.dayDiff == null ? 9999 : Math.abs(a.dayDiff);
        const bv = b.dayDiff == null ? 9999 : Math.abs(b.dayDiff);
        return av - bv;
      })
      .slice(0, 8);

    const lines = [];
    lines.push("AM TRADING - MARKET OVERALL REPORT");
    lines.push(`Generated: ${nowLabel}`);
    lines.push(`Session: ${marketSession} | Regime: ${regime} | Macro Tone: ${macroTone}`);
    lines.push("");
    lines.push("1) INDEX + MACRO SNAPSHOT");
    lines.push(`SPY ${spy ? `${Number(spy.changesPercentage || 0) >= 0 ? "+" : ""}${Number(spy.changesPercentage || 0).toFixed(2)}%` : "N/A"} | QQQ ${qqq ? `${Number(qqq.changesPercentage || 0) >= 0 ? "+" : ""}${Number(qqq.changesPercentage || 0).toFixed(2)}%` : "N/A"} | IWM ${iwm ? `${Number(iwm.changesPercentage || 0) >= 0 ? "+" : ""}${Number(iwm.changesPercentage || 0).toFixed(2)}%` : "N/A"}`);
    lines.push(`VIX proxy ${vix ? `${Number(vix.changesPercentage || 0) >= 0 ? "+" : ""}${Number(vix.changesPercentage || 0).toFixed(2)}%` : "N/A"} | USD ${usd ? `${Number(usd.changesPercentage || 0) >= 0 ? "+" : ""}${Number(usd.changesPercentage || 0).toFixed(2)}%` : "N/A"} | Oil ${oil ? `${Number(oil.changesPercentage || 0) >= 0 ? "+" : ""}${Number(oil.changesPercentage || 0).toFixed(2)}%` : "N/A"} | BTC ${btc ? `${Number(btc.changesPercentage || 0) >= 0 ? "+" : ""}${Number(btc.changesPercentage || 0).toFixed(2)}%` : "N/A"}`);
    lines.push("");
    lines.push("2) BREADTH + LEADERSHIP");
    lines.push(`Breadth: ${advancers} advancers / ${decliners} decliners (${breadthPct}% positive)`);
    lines.push(`Top gainers: ${topGainers.map((q) => `${q.symbol} ${Number(q.changesPercentage || 0) >= 0 ? "+" : ""}${Number(q.changesPercentage || 0).toFixed(2)}%`).join(" | ") || "N/A"}`);
    lines.push(`Top losers: ${topLosers.map((q) => `${q.symbol} ${Number(q.changesPercentage || 0).toFixed(2)}%`).join(" | ") || "N/A"}`);
    lines.push(`Sector leaders: ${sectorLeaders.map((s) => `${s.symbol} ${Number(s.changesPercentage || 0) >= 0 ? "+" : ""}${Number(s.changesPercentage || 0).toFixed(2)}%`).join(" | ") || "N/A"}`);
    lines.push(`Sector laggards: ${sectorLaggers.map((s) => `${s.symbol} ${Number(s.changesPercentage || 0).toFixed(2)}%`).join(" | ") || "N/A"}`);
    lines.push("");
    lines.push("3) SIGNALS + EVENT RISK");
    lines.push(`Macro green flags: ${(macroSignalFlags.green || []).slice(0, 3).join(" | ") || "None"}`);
    lines.push(`Macro red flags: ${(macroSignalFlags.red || []).slice(0, 3).join(" | ") || "None"}`);
    lines.push(`Auto risk events (next 3h): ${macroEventAlerts.length}`);
    lines.push(`Flow bias: ${flowBias} (Calls ${formatNum(flowCallNotional)} vs Puts ${formatNum(flowPutNotional)})`);
    lines.push(`Priority alerts: ${priAlerts.map((a) => `${a.symbol}(${a.score})`).join(" | ") || "None"}`);
    lines.push("");
    lines.push("4) NEWS + CATALYSTS");
    lines.push(`Upgrades: ${(newsIntel.upgrades || []).length} | Downgrades: ${(newsIntel.downgrades || []).length}`);
    lines.push(...headlines.map((n, i) => `${i + 1}. ${n.ticker || "MKT"} - ${n.title || "Headline unavailable"}`));
    lines.push("");
    lines.push("5) EARNINGS WATCH");
    lines.push(`Upcoming within 14d: ${earningsWatch.filter((e) => Number.isFinite(e.dayDiff) && e.dayDiff >= 0 && e.dayDiff <= 14).length}`);
    lines.push(...earningsWatch.map((e, i) => {
      const dateLabel = e.earningsDate ? new Date(e.earningsDate).toLocaleDateString() : "TBD";
      return `${i + 1}. ${e.symbol} - ${dateLabel} (${e.timing})`;
    }));
    lines.push("");
    lines.push("6) EXECUTION FOCUS");
    lines.push(`Rotation leaders: ${rotationRank.slice(0, 5).map((q) => `${q.symbol}(RS ${Number(q.relVsSpy || 0) >= 0 ? "+" : ""}${Number(q.relVsSpy || 0).toFixed(2)}%, RVOL ${Number(q.rvol || 0).toFixed(2)}x)`).join(" | ") || "N/A"}`);
    lines.push(`Suggested posture: ${regime === "Risk-On" ? "Lean long on high-RS names with confirmation." : regime === "Risk-Off" ? "Reduce gross, tighten stops, prioritize defense." : "Balanced posture; trade selective A+ setups only."}`);
    lines.push("");
    lines.push("Note: Decision-support only, not financial advice.");

    setMarketReportData({
      session: marketSession,
      regime,
      macroTone,
      indexRows: [
        { label: "SPY", value: Number(spy?.changesPercentage || 0) },
        { label: "QQQ", value: Number(qqq?.changesPercentage || 0) },
        { label: "IWM", value: Number(iwm?.changesPercentage || 0) },
        { label: "VIX", value: Number(vix?.changesPercentage || 0), invert: true },
        { label: "USD", value: Number(usd?.changesPercentage || 0), invert: true },
        { label: "OIL", value: Number(oil?.changesPercentage || 0), invert: true },
        { label: "BTC", value: Number(btc?.changesPercentage || 0) },
      ],
      breadth: { advancers, decliners, breadthPct },
      topGainers,
      topLosers,
      sectorLeaders,
      sectorLaggers,
      macroGreen: (macroSignalFlags.green || []).slice(0, 4),
      macroRed: (macroSignalFlags.red || []).slice(0, 4),
      flowBias,
      flowCallNotional,
      flowPutNotional,
      priAlerts,
      upgradesCount: (newsIntel.upgrades || []).length,
      downgradesCount: (newsIntel.downgrades || []).length,
      headlines,
      earningsWatch,
      rotationTop: rotationRank.slice(0, 5),
      posture: regime === "Risk-On"
        ? "Lean long on high-RS names with confirmation."
        : regime === "Risk-Off"
        ? "Reduce gross, tighten stops, prioritize defense."
        : "Balanced posture; trade selective A+ setups only.",
    });
    setMarketReportGeneratedAt(nowLabel);
    setMarketReportText(lines.join("\n"));
    setMarketReportOpen(true);
  }, [macroData, watchlistData, sectorData, combinedAlerts, newsData, marketSession, regime, macroTone, macroSignalFlags, macroEventAlerts.length, flowBias, flowCallNotional, flowPutNotional, newsIntel.upgrades, newsIntel.downgrades, rotationRank, providerKeys]);
  const applyWorkflowPrimary = useCallback((candidate, meta = {}) => {
    if (!candidate?.symbol) return;
    const entry = Number(candidate.entry || 0);
    const stop = Number(candidate.stop || 0);
    const target = Number(candidate.target || 0);
    setTerminalSymbol(candidate.symbol);
    setBacktestSymbol(candidate.symbol);
    if (entry > 0) setRiskEntry(entry.toFixed(2));
    if (stop > 0) setRiskStop(stop.toFixed(2));
    const liveRow = watchlistData.find((q) => q.symbol === candidate.symbol);
    if (liveRow) setSelectedStock(liveRow);
    setWorkflowAutoPlan((prev) => ({
      ...(prev || {}),
      ...meta,
      symbol: candidate.symbol,
      entry,
      stop,
      target,
      score: Number(candidate.score || 0),
      why: candidate.why || "No rationale available.",
    }));
    setActiveTab("terminal");
  }, [watchlistData]);

  const runWorkflowAuto = useCallback(async () => {
    const now = new Date().toLocaleString();
    const macroRegime = String(regime || "Neutral");
    const spy = Number(macroData.find((m) => m.symbol === "SPY")?.changesPercentage || 0);
    const flowMap = new Map((flowBySymbol || []).map((f) => [f.symbol, f]));
    const alertMap = new Map((combinedAlerts || []).map((a) => [a.symbol, Math.max(0, Number(a.score || 0))]));
    let sourceRows = scannerFilters.scope === "market" ? marketUniverseData : watchlistData;
    if (scannerFilters.scope === "market" && (!sourceRows || sourceRows.length === 0)) {
      sourceRows = await loadMarketUniverse();
    }
    const candidates = (sourceRows || [])
      .filter((q) => Number(q?.price || 0) > 0)
      .map((q) => {
        const scores = computeScores(q);
        const rvol = q.avgVolume ? q.volume / q.avgVolume : 0;
        const change = Number(q.changesPercentage || 0);
        const delta30 = Number(q.delta30m || 0);
        const sectorEtf = STOCK_TO_SECTOR[q.symbol] || "";
        const sectorPerf = Number(sectorData.find((s) => s.symbol === sectorEtf)?.changesPercentage || 0);
        const relVsSector = change - sectorPerf;
        const relVsSpy = change - spy;
        const flow = flowMap.get(q.symbol);
        const cp = Number(flow?.callPutRatio || 1);
        const flowBoost = flow ? (cp >= 1 ? Math.min(12, (cp - 1) * 8 + 4) : -Math.min(8, (1 - cp) * 8)) : 0;
        const alertBoost = (alertMap.get(q.symbol) || 0) * 0.12;
        const tickerIntel = newsIntel.byTicker[q.symbol] || { upgrades: 0, downgrades: 0, buyMentions: 0, sellMentions: 0 };
        const ratingBoost = (tickerIntel.upgrades + tickerIntel.buyMentions) * 2 - (tickerIntel.downgrades + tickerIntel.sellMentions) * 2.5;
        const regimePenalty = macroRegime.includes("Risk-Off") && change > 0 ? -3 : 0;
        const score = (
          scores.composite * 0.5 +
          Math.max(-5, Math.min(8, change)) * 3 +
          Math.max(-3, Math.min(4, delta30)) * 2.4 +
          Math.max(-4, Math.min(5, relVsSector)) * 2.1 +
          Math.max(-4, Math.min(5, relVsSpy)) * 1.8 +
          Math.max(0, Math.min(3, rvol - 1)) * 8 +
          flowBoost +
          alertBoost +
          ratingBoost +
          regimePenalty
        );
        const entry = Number(q.price || 0);
        const stop = entry > 0 ? entry * 0.97 : 0;
        const target = entry > 0 ? entry + (entry - stop) * 2 : 0;
        const reasons = [];
        reasons.push(`Composite ${scores.composite}`);
        if (rvol >= 1.2) reasons.push(`RVOL ${rvol.toFixed(2)}x`);
        if (relVsSector > 0) reasons.push(`Outperforming ${sectorEtf || "sector"} by ${relVsSector.toFixed(2)}%`);
        if (relVsSpy > 0) reasons.push(`Beating SPY by ${relVsSpy.toFixed(2)}%`);
        if (flow) reasons.push(`Options C/P ${cp.toFixed(2)}`);
        if (tickerIntel.upgrades > 0) reasons.push(`Upgrade/Bullish mentions ${tickerIntel.upgrades + tickerIntel.buyMentions}`);
        if (tickerIntel.downgrades > 0) reasons.push(`Downgrade risk ${tickerIntel.downgrades}`);
        if (delta30 > 0) reasons.push(`30m momentum +${delta30.toFixed(2)}%`);
        return {
          symbol: q.symbol,
          score: Number(score.toFixed(1)),
          why: reasons.slice(0, 5).join(" | "),
          entry,
          stop,
          target,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    const primary = candidates[0] || { symbol: "N/A", score: 0, why: "No candidates", entry: 0, stop: 0, target: 0 };
    const previousSymbol = String(workflowAutoPlan?.symbol || "");
    const rotatedPrimary = candidates[1] && previousSymbol === primary.symbol && Math.abs(primary.score - candidates[1].score) <= 4
      ? candidates[1]
      : primary;
    const focusList = candidates.slice(0, 3).map((c) => c.symbol).join(", ");

    setWorkflowState((prev) => ({
      premarket: {
        ...prev.premarket,
        checklist: prev.premarket.checklist.map((x) => ({ ...x, done: true })),
        notes: `Auto plan generated ${now}\nScope: ${scannerFilters.scope.toUpperCase()}\nSession: ${marketSession}\nRegime: ${macroRegime}\nFocus list: ${focusList || "N/A"}\nPrimary candidate: ${rotatedPrimary.symbol}\nWHY: ${rotatedPrimary.why}\nAnalyst upgrades: ${newsIntel.upgrades.length} | downgrades: ${newsIntel.downgrades.length}\nMacro green flags: ${macroSignalFlags.green.length} | red flags: ${macroSignalFlags.red.length}`,
      },
      live: {
        ...prev.live,
        checklist: prev.live.checklist.map((x) => ({ ...x, done: true })),
        notes: `Execution focus: ${rotatedPrimary.symbol}\nInstitutional score: ${rotatedPrimary.score}\nEntry: ${rotatedPrimary.entry > 0 ? `$${rotatedPrimary.entry.toFixed(2)}` : "N/A"}\nStop: ${rotatedPrimary.stop > 0 ? `$${rotatedPrimary.stop.toFixed(2)}` : "N/A"}\nTarget: ${rotatedPrimary.target > 0 ? `$${rotatedPrimary.target.toFixed(2)}` : "N/A"}\nWHY: ${rotatedPrimary.why}`,
      },
      postmarket: {
        ...prev.postmarket,
        checklist: prev.postmarket.checklist,
        notes: prev.postmarket.notes || "Postmarket review placeholder generated. Fill after close.",
      },
    }));

    setWorkflowAutoPlan({
      createdAt: now,
      symbol: rotatedPrimary.symbol,
      entry: rotatedPrimary.entry,
      stop: rotatedPrimary.stop,
      target: rotatedPrimary.target,
      score: rotatedPrimary.score,
      why: rotatedPrimary.why,
      scope: scannerFilters.scope,
      regime: macroRegime,
      top3: focusList || "N/A",
      candidates,
    });
    applyWorkflowPrimary(rotatedPrimary, {
      createdAt: now,
      scope: scannerFilters.scope,
      regime: macroRegime,
      top3: focusList || "N/A",
      candidates,
    });
  }, [watchlistData, marketUniverseData, macroData, sectorData, flowBySymbol, combinedAlerts, newsIntel, regime, marketSession, macroSignalFlags, workflowAutoPlan?.symbol, applyWorkflowPrimary, scannerFilters.scope, loadMarketUniverse]);

  const riskPlan = useMemo(() => {
    const account = Number(riskAccount || 0);
    const pct = Number(riskPct || 0) / 100;
    const entry = Number(riskEntry || 0);
    const stop = Number(riskStop || 0);
    const maxPosPct = Math.max(1, Math.min(100, Number(riskMaxPosPct || 0)));
    const corrCap = Math.max(0.3, Math.min(1, Number(riskCorrCap || 0)));
    const atrPct = Math.max(0.2, Number(riskAtrPct || 0));
    const slipBps = Math.max(0, Number(riskSlipBps || 0));
    const side = String(riskSide || "long").toLowerCase() === "short" ? "short" : "long";
    const quality = String(riskSetupQuality || "A").toUpperCase();
    const qualityMult = quality === "A+" ? 1 : quality === "A" ? 0.9 : quality === "B" ? 0.72 : 0.55;
    const regimeMult = regime === "Risk-On" ? 1 : regime === "Goldilocks" ? 0.95 : regime === "Neutral" ? 0.85 : regime === "Risk-Off" ? 0.6 : regime === "Defensive" ? 0.65 : 0.8;

    const baseRiskDollars = account * pct;
    const adjustedRiskBudget = baseRiskDollars * qualityMult * regimeMult;
    const rawStopDistance = Math.abs(entry - stop);
    const slippagePerShare = entry > 0 ? entry * (slipBps / 10000) : 0;
    const perShare = Math.max(0, rawStopDistance + slippagePerShare);
    const baseShares = perShare > 0 ? Math.floor(adjustedRiskBudget / perShare) : 0;
    const volAdj = Math.max(0.45, Math.min(1.2, 2.5 / atrPct));
    const sharesAfterModel = Math.floor(baseShares * volAdj * corrCap);
    const maxNotional = account * (maxPosPct / 100);
    const maxSharesByNotional = entry > 0 ? Math.floor(maxNotional / entry) : 0;
    const shares = Math.max(0, Math.min(sharesAfterModel, maxSharesByNotional || sharesAfterModel));
    const position = shares * entry;
    const estRisk = shares * perShare;
    const stopPct = entry > 0 ? (rawStopDistance / entry) * 100 : 0;
    const t1 = side === "long" ? entry + perShare : entry - perShare;
    const t2 = side === "long" ? entry + perShare * 2 : entry - perShare * 2;
    const remainingCap = Math.max(0, maxNotional - position);

    return {
      side,
      quality,
      regime,
      regimeMult,
      qualityMult,
      riskDollars: adjustedRiskBudget,
      baseRiskDollars,
      perShare,
      stopPct,
      shares,
      position,
      estRisk,
      t1,
      t2,
      maxNotional,
      remainingCap,
      maxSharesByNotional,
      volAdj,
      corrCap,
      slippagePerShare,
    };
  }, [riskAccount, riskPct, riskEntry, riskStop, riskMaxPosPct, riskCorrCap, riskAtrPct, riskSlipBps, riskSide, riskSetupQuality, regime]);
  const regimeColor = {
    "Risk-On": C.green, "Risk-Off": C.red, "Growth": C.cyan,
    "Goldilocks": C.green, "Defensive": C.amber, "Neutral": C.textSec, "Loading…": C.textDim,
  };
  const dataFreshSec = lastUpdate ? Math.max(0, Math.floor((Date.now() - lastUpdate.getTime()) / 1000)) : null;
  const dataBadge = dataSourceStatus === "live"
    ? (dataFreshSec !== null && dataFreshSec > 90 ? "STALE" : "LIVE")
    : dataSourceStatus === "updating" ? "UPDATING" : dataSourceStatus === "degraded" ? "DEGRADED" : "CONNECTING";
  const dataBadgeColor = dataBadge === "LIVE" ? C.green : dataBadge === "UPDATING" ? C.accent : dataBadge === "STALE" ? C.amber : C.red;
  const providersConfigured = [providerKeys.finnhubKey, providerKeys.fmpKey, providerKeys.polygonKey, providerKeys.uwKey, providerKeys.tradierKey]
    .filter((x) => String(x || "").trim()).length;
  const panelCount = terminalLayout === "4" ? 4 : terminalLayout === "2" ? 2 : 1;
  const activePanelSymbols = terminalPanelSymbols.slice(0, panelCount);
  const handlePanelSymbolChange = useCallback((idx, symbol) => {
    setTerminalPanelSymbols((prev) => {
      const next = [...prev];
      next[idx] = symbol;
      return next;
    });
    if (idx === 0) setTerminalSymbol(symbol);
  }, []);

  useEffect(() => {
    if (!apiKey) return;
    setLoading(true);
    fetchAll(apiKey).finally(() => setLoading(false));
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => fetchAll(apiKey), 180000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [apiKey, fetchAll]);

  useEffect(() => {
    if (scannerFilters.scope !== "market") return;
    if (marketUniverseData.length > 0) return;
    loadMarketUniverse();
  }, [scannerFilters.scope, marketUniverseData.length, loadMarketUniverse]);

  if (!appUnlocked) {
    return (
      <PasswordLockScreen
        value={unlockInput}
        error={unlockError}
        onChange={(v) => { setUnlockInput(v); if (unlockError) setUnlockError(""); }}
        onSubmit={handleUnlock}
      />
    );
  }

  if (!apiKey) return <ApiKeyScreen onSubmit={handleApiKey} />;

  const SortH = ({ col, children, align = "left" }) => (
    <th onClick={() => handleSort(col)} style={{
      padding: "10px 8px", fontSize: 11, fontFamily: MONO, letterSpacing: "0.04em",
      color: sortCol === col ? C.accent : C.textDim, textAlign: align, cursor: "pointer",
      borderBottom: `1px solid ${C.border}`, userSelect: "none", whiteSpace: "nowrap",
    }}>
      {children}{sortCol === col ? (sortDir === "desc" ? " ▼" : " ▲") : ""}
    </th>
  );

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: SANS, zoom: UI_ZOOM, lineHeight: 1.45, width: "100%", maxWidth: "100vw", overflowX: "hidden" }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />

      {/* Top Bar */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "12px 22px", borderBottom: `1px solid ${C.border}`, background: C.surface, flexWrap: "wrap", rowGap: 10,
        position: "sticky", top: 0, zIndex: 40,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0, flex: "1 1 auto", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img
              src="/axiom-runner/assets/am-trading-logo.png?v=2"
              alt="AM Trading Platform"
              style={{ width: 48, height: 48, objectFit: "contain", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface }}
            />
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.05 }}>
              <span style={{ fontFamily: MONO, fontWeight: 800, fontSize: 20, color: C.text, letterSpacing: "-0.02em" }}>AM TRADING</span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em" }}>PLATFORM</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, overflowX: "auto", maxWidth: "100%", paddingBottom: 2, scrollbarWidth: "thin", flexWrap: "nowrap" }}>
            {[
              { id: "dashboard", label: "MONITOR" },
              { id: "terminal", label: "TERMINAL" },
                { id: "macro", label: "MACRO" },
                { id: "news", label: "NEWS" },
                { id: "tv", label: "LIVE TV" },
                { id: "alerts", label: "ALERTS" },
              { id: "workflow", label: "WORKFLOW" },
              { id: "flow", label: "FLOW" },
              { id: "portfolio", label: "PORTFOLIO" },
              { id: "scanner", label: "SCANNER" },
              { id: "backtest", label: "BACKTEST" },
              { id: "rotation", label: "ROTATION" },
              { id: "tools", label: "TOOLS" },
              { id: "sectors", label: "SECTORS" },
            ].map(t => (
              <Pill key={t.id} active={activeTab === t.id} onClick={() => setActiveTab(t.id)}>{t.label}</Pill>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "1 1 640px", minWidth: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            border: `1px solid ${C.accent}55`,
            background: `linear-gradient(120deg, ${C.accent}10 0%, ${C.cyan}14 52%, ${C.green}10 100%)`,
            borderRadius: 6,
            padding: "6px 10px",
            flex: "1 1 220px",
            minWidth: 170,
            maxWidth: 360,
            boxShadow: `inset 0 0 0 1px ${C.surface}`,
            overflow: "hidden",
          }}>
            <span style={{ fontFamily: MONO, fontSize: 10, color: C.accent, letterSpacing: "0.06em", fontWeight: 700 }}>
              WEATHER {WEATHER_ZIP}
            </span>
            {weatherData ? (
              <>
                <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: weatherData.temp >= 85 ? C.red : weatherData.temp <= 40 ? C.cyan : C.text }}>
                  {weatherData.temp.toFixed(0)}°F
                </span>
                <span style={{ fontFamily: SANS, fontSize: 10, color: C.text, maxWidth: 72, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", background: `${C.surface}C9`, border: `1px solid ${C.border}`, borderRadius: 999, padding: "1px 7px", fontWeight: 600 }}>
                  {weatherCodeLabel(weatherData.code)}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.text, background: `${C.green}1A`, border: `1px solid ${C.green}45`, borderRadius: 999, padding: "1px 7px", fontWeight: 700 }}>
                  H/L {weatherData.high.toFixed(0)}°/{weatherData.low.toFixed(0)}°
                </span>
              </>
            ) : (
              <span style={{ fontFamily: SANS, fontSize: 10, color: weatherError ? C.red : C.textSec, fontWeight: 600 }}>
                {weatherError ? "Unavailable" : "Loading..."}
              </span>
            )}
            <button
              onClick={fetchWeather}
              style={{ border: `1px solid ${C.accent}66`, background: `${C.accent}14`, color: C.accent, borderRadius: 4, padding: "3px 7px", fontFamily: MONO, fontSize: 9, fontWeight: 700, cursor: "pointer", marginLeft: "auto" }}
            >
              {weatherLoading ? "..." : "↻"}
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "1 1 270px", minWidth: 0 }}>
            <input
              value={symbolSearch}
              onChange={(e) => setSymbolSearch(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === "Enter") handleSymbolSearch(); }}
              placeholder="Search ticker (NVDA)"
              style={{ width: "min(220px, 42vw)", minWidth: 120, border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 4, padding: "7px 10px", fontFamily: MONO, fontSize: 11 }}
            />
              <button onClick={handleSymbolSearch} style={{ border: `1px solid ${C.border}`, background: C.card, color: C.textSec, borderRadius: 4, padding: "7px 10px", fontFamily: MONO, fontSize: 11, cursor: "pointer" }}>
                SEARCH
              </button>
              <button onClick={() => openTradingView(symbolSearch || terminalSymbol)} style={{ border: `1px solid ${C.border}`, background: C.card, color: C.accent, borderRadius: 4, padding: "7px 10px", fontFamily: MONO, fontSize: 11, cursor: "pointer" }}>
                TV
              </button>
            </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "4px 12px",
            background: `${regimeColor[regime]}12`, borderRadius: 3, border: `1px solid ${regimeColor[regime]}30`,
          }}>
            <span style={{ fontSize: 11, fontFamily: MONO, color: regimeColor[regime], fontWeight: 700, letterSpacing: "0.06em" }}>
              {regime.toUpperCase()}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 7, height: 7, borderRadius: "50%", background: C.green,
              boxShadow: `0 0 6px ${C.green}`, animation: "pulse 2s infinite",
            }} />
            <span style={{ fontSize: 10, fontFamily: MONO, color: C.textDim }}>
              {lastUpdate ? `Updated ${lastUpdate.toLocaleTimeString()}` : "CONNECTING…"}
            </span>
          </div>
          <button onClick={() => setSettings((s) => ({ ...s, themeMode: themeMode === "dark" ? "light" : "dark" }))} style={{
            background: C.card, border: `1px solid ${C.border}`, color: C.textSec,
            fontFamily: MONO, fontSize: 10, padding: "6px 11px", borderRadius: 3, cursor: "pointer",
          }}>
            {themeMode === "dark" ? "LIGHT" : "DARK"}
          </button>
          <button onClick={() => { setLoading(true); fetchAll(apiKey).finally(() => setLoading(false)); }} style={{
            background: C.card, border: `1px solid ${C.border}`, color: C.textSec,
            fontFamily: MONO, fontSize: 10, padding: "6px 11px", borderRadius: 3, cursor: "pointer",
          }}>
            {loading ? "⟳" : "REFRESH"}
          </button>
          <button onClick={generateMarketReport} style={{
            background: `${C.accent}12`, border: `1px solid ${C.accent}55`, color: C.accent,
            fontFamily: MONO, fontSize: 10, fontWeight: 700, padding: "6px 11px", borderRadius: 3, cursor: "pointer",
          }}>
            MARKET REPORT
          </button>
          <button onClick={handleLock} style={{
            background: `${C.red}12`, border: `1px solid ${C.red}55`, color: C.red,
            fontFamily: MONO, fontSize: 10, fontWeight: 700, padding: "6px 11px", borderRadius: 3, cursor: "pointer",
          }}>
            LOCK
          </button>
          <button onClick={() => setPaletteOpen(true)} style={{
            background: C.card, border: `1px solid ${C.border}`, color: C.textSec,
            fontFamily: MONO, fontSize: 10, padding: "6px 11px", borderRadius: 3, cursor: "pointer",
          }}>
            CMD
          </button>
        </div>
      </div>

      <div style={{ padding: "6px 18px", borderBottom: `1px solid ${C.border}`, background: C.surface, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>DATA SOURCE</span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: C.text }}>Multi-Provider (Finnhub + FMP + Yahoo fallback)</span>
        <Badge color={dataBadgeColor}>{dataBadge}</Badge>
        <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>
          {providersConfigured > 0 ? `${providersConfigured} key${providersConfigured > 1 ? "s" : ""} configured` : "No provider keys configured"}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>
          {lastUpdate ? `Last tick ${lastUpdate.toLocaleTimeString()}` : "Awaiting first tick"}
          {dataFreshSec !== null ? ` · ${dataFreshSec}s ago` : ""}
        </span>
      </div>
      <div style={{ borderBottom: `1px solid ${C.border}`, background: themeMode === "dark" ? "#0f1a2d" : "#f7faff", overflow: "hidden", whiteSpace: "nowrap" }}>
        <div className="axiom-ticker-track" style={{ display: "inline-flex", alignItems: "center", gap: 26, padding: "7px 0", animation: "axiomTickerLTR 320s linear infinite" }}>
          {[...topHeadlineTape, ...topHeadlineTape].map((item, i) => {
            const isDarkNews = themeMode === "dark" && item.kind === "NEWS";
            const toneColor = isDarkNews ? "#2a2100" : (item.tone === "red" ? C.red : item.tone === "green" ? C.green : item.tone === "amber" ? C.amber : C.accent);
            const toneBg = isDarkNews ? "#ffd54a" : (item.tone === "red" ? C.redBg : item.tone === "green" ? C.greenBg : item.tone === "amber" ? C.amberBg : `${C.accent}12`);
            const toneBorder = isDarkNews ? "#caa32b" : `${toneColor}40`;
            return (
              <span key={`ticker-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 8, paddingRight: 8 }}>
                <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: toneColor, background: toneBg, border: `1px solid ${toneBorder}`, borderRadius: 3, padding: "2px 5px" }}>
                  {item.kind}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.text }}>{item.symbol}</span>
                <span style={{ fontSize: 11, color: themeMode === "dark" ? "#d6e2fa" : C.textSec, maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block", verticalAlign: "bottom" }}>
                  {item.text}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Macro Tape */}
      <MacroTape data={macroData} cryptoSnapshot={cryptoSnapshot} />

      {error && (
        <div style={{ padding: "8px 18px", fontSize: 11, fontFamily: MONO, color: C.red, background: C.redBg }}>
          {error}
        </div>
      )}

      {/* Content */}
      <div style={{ padding: LAYOUT.contentPadding, maxWidth: LAYOUT.pageMaxWidth, margin: "0 auto" }}>
        {loading && !watchlistData.length && (
          <div style={{ textAlign: "center", padding: 60, fontFamily: MONO, color: C.textDim }}>
            <div style={{ fontSize: 14, marginBottom: 8 }}>Fetching live market data…</div>
            <div style={{ fontSize: 10 }}>Connecting to multi-provider quote engine</div>
          </div>
        )}

        {activeTab === "terminal" && watchlistData.length > 0 && (
          <TerminalWorkspace
            watchlistData={watchlistData}
            macroData={macroData}
            sectorData={sectorData}
            newsData={newsData}
            alerts={alerts}
            selectedSymbol={terminalSymbol}
            onSelectSymbol={setTerminalSymbol}
            timeframe={terminalTf}
            onTimeframeChange={setTerminalTf}
            candleData={terminalCandles}
            loadingCandles={terminalCandlesLoading}
            terminalLayout={terminalLayout}
            onLayoutChange={setTerminalLayout}
            hotkeyProfile={hotkeyProfile}
            onHotkeyProfileChange={setHotkeyProfile}
            drawTools={drawTools}
            onDrawToolsChange={setDrawTools}
            panelSymbols={activePanelSymbols}
            onPanelSymbolChange={handlePanelSymbolChange}
            panelCandleMap={terminalPanelCandles}
            fundamentals={terminalFundamentals}
          />
        )}

        {activeTab === "dashboard" && watchlistData.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: `minmax(860px, 1fr) minmax(340px, ${LAYOUT.sidebarWidth}px)`, gap: LAYOUT.gridGap, alignItems: "start" }}>
            {/* Watchlist Table */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontFamily: SANS, fontSize: 15, color: C.textSec, fontWeight: 600, letterSpacing: "0.01em" }}>
                  WATCHLIST — {watchlistData.length} SYMBOLS — REAL-TIME QUOTES
                </span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    value={watchlistInput}
                    onChange={(e) => setWatchlistInput(e.target.value)}
                    placeholder="AAPL,MSFT,NVDA"
                    style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 10, padding: "6px 8px", minWidth: 160, width: "min(300px, 40vw)" }}
                  />
                  <button onClick={() => {
                    const next = watchlistInput.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
                    if (next.length) {
                      setWatchlistSymbols(Array.from(new Set(next)));
                      setLoading(true);
                      fetchAll(apiKey).finally(() => setLoading(false));
                    }
                  }} style={{ background: C.card, border: `1px solid ${C.border}`, color: C.textSec, fontFamily: MONO, fontSize: 10, padding: "6px 8px", cursor: "pointer" }}>
                    SAVE LIST
                  </button>
                  <select
                    value={String(settings.refreshMs)}
                    onChange={(e) => setSettings((s) => ({ ...s, refreshMs: Number(e.target.value) }))}
                    style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 10, padding: "6px 8px" }}
                  >
                    <option value="60000">Refresh 1m</option>
                    <option value="180000">Refresh 3m</option>
                    <option value="300000">Refresh 5m</option>
                  </select>
                </div>
              </div>
              <div style={{
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 5,
                overflow: "hidden",
              }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: C.surface }}>
                        <SortH col="symbol">SYMBOL</SortH>
                        <SortH col="price" align="right">PRICE</SortH>
                        <SortH col="change" align="right">CHG%</SortH>
                        <th style={{ padding: "10px 8px", fontSize: 10, fontFamily: MONO, color: C.textDim, textAlign: "right", borderBottom: `1px solid ${C.border}`, letterSpacing: "0.08em" }}>5M</th>
                        <th style={{ padding: "10px 8px", fontSize: 10, fontFamily: MONO, color: C.textDim, textAlign: "right", borderBottom: `1px solid ${C.border}`, letterSpacing: "0.08em" }}>30M</th>
                        <th style={{ padding: "10px 8px", fontSize: 10, fontFamily: MONO, color: C.textDim, textAlign: "center", borderBottom: `1px solid ${C.border}`, letterSpacing: "0.08em" }}>TREND</th>
                        <SortH col="rvol" align="right">RVOL</SortH>
                        <SortH col="volume" align="right">VOLUME</SortH>
                        <SortH col="mktcap" align="right">MKT CAP</SortH>
                        <SortH col="composite">SCORE</SortH>
                        <SortH col="tech">TECH</SortH>
                        <SortH col="fund">FUND</SortH>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map(q => {
                        const chg = q.changesPercentage || 0;
                        const isUp = chg >= 0;
                        const scores = computeScores(q);
                        const trend = classifyTrend(q);
                        const rvol = q.avgVolume ? (q.volume / q.avgVolume) : 0;
                        return (
                          <tr key={q.symbol}
                            onClick={() => setSelectedStock(q)}
                            style={{ cursor: "pointer", transition: "background 0.1s" }}
                            onMouseEnter={e => e.currentTarget.style.background = C.cardHover}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                          >
                            <td style={{ padding: "10px 10px", borderBottom: `1px solid ${C.border}` }}>
                              <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 14, color: C.text }}>{q.symbol}</div>
                              <div style={{ fontFamily: SANS, fontSize: 11, color: C.textDim, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.name}</div>
                              <button
                                onClick={(e) => { e.stopPropagation(); openTradingView(q.symbol); }}
                                style={{ marginTop: 4, border: `1px solid ${C.border}`, background: C.surface, color: C.accent, borderRadius: 4, padding: "2px 6px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                              >
                                TV CHART
                              </button>
                            </td>
                            <td style={{ padding: "10px 8px", fontFamily: MONO, fontSize: 15, color: C.text, textAlign: "right", borderBottom: `1px solid ${C.border}`, fontWeight: 700 }}>
                              ${q.price?.toFixed(2)}
                            </td>
                            <td style={{
                              padding: "10px 8px", fontFamily: MONO, fontSize: 15, fontWeight: 700, textAlign: "right",
                              color: isUp ? C.green : C.red, borderBottom: `1px solid ${C.border}`,
                              background: isUp ? C.greenBg : C.redBg,
                            }}>
                              {isUp ? "+" : ""}{chg.toFixed(2)}%
                            </td>
                            <td style={{ padding: "10px 8px", fontFamily: MONO, fontSize: 12, textAlign: "right", borderBottom: `1px solid ${C.border}`, color: (q.delta5m || 0) >= 0 ? C.green : C.red }}>
                              {(q.delta5m || 0) >= 0 ? "+" : ""}{(q.delta5m || 0).toFixed(2)}%
                            </td>
                            <td style={{ padding: "10px 8px", fontFamily: MONO, fontSize: 12, textAlign: "right", borderBottom: `1px solid ${C.border}`, color: (q.delta30m || 0) >= 0 ? C.green : C.red }}>
                              {(q.delta30m || 0) >= 0 ? "+" : ""}{(q.delta30m || 0).toFixed(2)}%
                            </td>
                            <td style={{ padding: "10px 8px", textAlign: "center", borderBottom: `1px solid ${C.border}` }}>
                              <TrendTag trend={trend} />
                            </td>
                            <td style={{
                              padding: "10px 8px", fontFamily: MONO, fontSize: 13, textAlign: "right",
                              color: rvol > 1.3 ? C.green : rvol > 1 ? C.text : C.textDim,
                              borderBottom: `1px solid ${C.border}`,
                            }}>
                              {rvol.toFixed(2)}x
                            </td>
                            <td style={{ padding: "10px 8px", fontFamily: MONO, fontSize: 13, color: C.textSec, textAlign: "right", borderBottom: `1px solid ${C.border}` }}>
                              {q.volume ? (q.volume / 1e6).toFixed(1) + "M" : "—"}
                            </td>
                            <td style={{ padding: "10px 8px", fontFamily: MONO, fontSize: 13, color: C.textSec, textAlign: "right", borderBottom: `1px solid ${C.border}` }}>
                              {formatNum(q.marketCap)}
                            </td>
                            <td style={{ padding: "7px 6px", borderBottom: `1px solid ${C.border}`, minWidth: 65 }}>
                              <ScoreBar value={scores.composite} />
                            </td>
                            <td style={{ padding: "7px 6px", borderBottom: `1px solid ${C.border}`, minWidth: 55 }}>
                              <ScoreBar value={scores.tech} color={C.cyan} />
                            </td>
                            <td style={{ padding: "7px 6px", borderBottom: `1px solid ${C.border}`, minWidth: 55 }}>
                              <ScoreBar value={scores.fund} color={C.purple} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div style={{ marginTop: 6, fontSize: 8, fontFamily: MONO, color: C.textDim, textAlign: "center" }}>
                Click any row for deep-dive · Auto-refreshes every {Math.round(settings.refreshMs / 60000)}m · Data via multi-provider quote engine
              </div>
            </div>

            {/* Right Sidebar */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, alignSelf: "start" }}>
              {/* Alerts Feed */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 5, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 9, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em" }}>
                    ALERT FEED
                  </div>
                  <Badge color={combinedAlerts.length ? C.amber : C.textDim}>{combinedAlerts.length ? `${combinedAlerts.length} ACTIVE` : "CLEAR"}</Badge>
                </div>
                {combinedAlerts.length === 0 && (
                  <div style={{ fontSize: 10, fontFamily: SANS, color: C.textDim }}>
                    No high-priority alerts right now.
                  </div>
                )}
                {combinedAlerts.map((a, i) => (
                  <div key={`${a.symbol}-${i}`} style={{
                    borderBottom: `1px solid ${C.border}`, padding: "7px 0",
                    display: "grid", gridTemplateColumns: "50px 1fr", gap: 8,
                  }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.text }}>{a.symbol}</span>
                      <Badge color={a.type === "risk" ? C.red : a.type === "flow" ? C.amber : C.green}>{a.type}</Badge>
                    </div>
                    <div>
                      <div style={{ fontFamily: SANS, fontSize: 10, color: C.textSec, lineHeight: 1.35 }}>{a.text}</div>
                      <div style={{ marginTop: 5 }}>
                        <ScoreBar value={a.score} color={a.type === "risk" ? C.red : a.type === "flow" ? C.amber : C.green} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Market Summary */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 5, padding: 14 }}>
                <div style={{ fontSize: 11, fontFamily: SANS, color: C.textSec, fontWeight: 600, letterSpacing: "0.01em", marginBottom: 10 }}>
                  MARKET SNAPSHOT
                </div>
                {macroData.filter(q => ["SPY","QQQ","IWM","DIA"].includes(q.symbol)).map(q => {
                  const chg = q.changesPercentage || 0;
                  const isUp = chg >= 0;
                  return (
                    <div key={q.symbol} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "5px 0", borderBottom: `1px solid ${C.border}`,
                    }}>
                      <div>
                        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.text }}>{q.symbol}</span>
                        <span style={{ fontFamily: SANS, fontSize: 8, color: C.textDim, marginLeft: 6 }}>{q._label}</span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontFamily: MONO, fontSize: 10, color: C.text, marginRight: 8 }}>${q.price?.toFixed(2)}</span>
                        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: isUp ? C.green : C.red }}>
                          {isUp ? "+" : ""}{chg.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Daily Economic Calendar */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 5, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontFamily: SANS, color: C.textSec, fontWeight: 600, letterSpacing: "0.01em" }}>
                    DAILY ECONOMIC CALENDAR
                  </div>
                  <Badge color={(econCalendarRows || []).some((e) => e.phase === "live" || e.phase === "imminent") ? C.red : C.green}>
                    {(econCalendarRows || []).some((e) => e.phase === "live" || e.phase === "imminent") ? "RISK WINDOW" : "NORMAL"}
                  </Badge>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
                  <button
                    onClick={() => setSettings((s) => ({ ...s, econCalendarView: "today" }))}
                    style={{ border: `1px solid ${econCalendarView === "today" ? C.accent : C.border}`, background: econCalendarView === "today" ? `${C.accent}14` : C.surface, color: econCalendarView === "today" ? C.accent : C.textSec, borderRadius: 4, padding: "4px 6px", fontFamily: MONO, fontSize: 9, fontWeight: 700, cursor: "pointer" }}
                  >
                    TODAY
                  </button>
                  <button
                    onClick={() => setSettings((s) => ({ ...s, econCalendarView: "week" }))}
                    style={{ border: `1px solid ${econCalendarView === "week" ? C.accent : C.border}`, background: econCalendarView === "week" ? `${C.accent}14` : C.surface, color: econCalendarView === "week" ? C.accent : C.textSec, borderRadius: 4, padding: "4px 6px", fontFamily: MONO, fontSize: 9, fontWeight: 700, cursor: "pointer" }}
                  >
                    THIS WEEK
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
                  <button
                    onClick={() => setSettings((s) => ({ ...s, econCalendarRegion: "US" }))}
                    style={{ border: `1px solid ${econCalendarRegion === "US" ? C.green : C.border}`, background: econCalendarRegion === "US" ? `${C.green}14` : C.surface, color: econCalendarRegion === "US" ? C.green : C.textSec, borderRadius: 4, padding: "4px 6px", fontFamily: MONO, fontSize: 9, fontWeight: 700, cursor: "pointer" }}
                  >
                    US ONLY
                  </button>
                  <button
                    onClick={() => setSettings((s) => ({ ...s, econCalendarRegion: "GLOBAL" }))}
                    style={{ border: `1px solid ${econCalendarRegion === "GLOBAL" ? C.purple : C.border}`, background: econCalendarRegion === "GLOBAL" ? `${C.purple}14` : C.surface, color: econCalendarRegion === "GLOBAL" ? C.purple : C.textSec, borderRadius: 4, padding: "4px 6px", fontFamily: MONO, fontSize: 9, fontWeight: 700, cursor: "pointer" }}
                  >
                    GLOBAL
                  </button>
                </div>
                <button
                  onClick={() => setSettings((s) => ({ ...s, econAutoRisk30m: !econAutoRisk30m }))}
                  style={{ width: "100%", marginBottom: 8, border: `1px solid ${econAutoRisk30m ? C.red : C.border}`, background: econAutoRisk30m ? `${C.red}14` : C.surface, color: econAutoRisk30m ? C.red : C.textSec, borderRadius: 4, padding: "5px 8px", fontFamily: MONO, fontSize: 9, fontWeight: 700, cursor: "pointer" }}
                >
                  {econAutoRisk30m ? "AUTO REDUCE RISK T-30M: ON" : "AUTO REDUCE RISK T-30M: OFF"}
                </button>
                {(econCalendarRows || [])
                  .map((e) => (
                    <div key={`daily-eco-${e.id}`} style={{
                      borderBottom: `1px solid ${C.border}`,
                      padding: "6px 0",
                      display: "grid",
                      gridTemplateColumns: "54px 1fr 78px",
                      gap: 8,
                      alignItems: "center",
                    }}>
                      <div>
                        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.accent }}>{e.tag}</span>
                        <div style={{ fontFamily: MONO, fontSize: 8, color: e.severity === "high" ? C.red : e.severity === "medium" ? C.amber : C.green, fontWeight: 700 }}>
                          {e.impact || String(e.severity || "").toUpperCase()}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontFamily: SANS, fontSize: 10, color: C.textSec, lineHeight: 1.3 }}>{e.title}</div>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginTop: 2 }}>
                          {e.region} • {e.time.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </div>
                      </div>
                      <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, textAlign: "right", color: e.phase === "live" ? C.red : e.phase === "imminent" ? C.amber : C.textSec }}>
                        {e.phase === "live" ? "LIVE" : formatCountdown(e.tteMs)}
                      </span>
                    </div>
                  ))}
                {!((econCalendarRows || []).length) && (
                  <div style={{ fontSize: 10, fontFamily: SANS, color: C.textDim }}>
                    No major events in selected window.
                  </div>
                )}
              </div>

              {/* Weather */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 5, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontFamily: SANS, color: C.textSec, fontWeight: 600, letterSpacing: "0.01em" }}>
                    WEATHER ({WEATHER_ZIP})
                  </div>
                  <button
                    onClick={fetchWeather}
                    style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 4, padding: "3px 7px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                  >
                    {weatherLoading ? "..." : "REFRESH"}
                  </button>
                </div>
                {weatherError && <div style={{ fontSize: 11, color: C.red }}>{weatherError}</div>}
                {!weatherError && weatherData && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, background: C.surface }}>
                      <div style={{ fontSize: 10, color: C.textDim }}>{weatherData.location}</div>
                      <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 800, color: C.text }}>{weatherData.temp.toFixed(0)}°F</div>
                      <div style={{ fontSize: 10, color: C.textSec }}>{weatherCodeLabel(weatherData.code)}</div>
                    </div>
                    <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, background: C.surface }}>
                      <div style={{ fontSize: 10, color: C.textDim }}>High / Low</div>
                      <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700 }}>{weatherData.high.toFixed(0)}° / {weatherData.low.toFixed(0)}°</div>
                      <div style={{ fontSize: 10, color: C.textDim }}>Wind {weatherData.wind.toFixed(0)} mph</div>
                    </div>
                  </div>
                )}
                {!weatherError && !weatherData && <div style={{ fontSize: 11, color: C.textDim }}>Loading weather...</div>}
              </div>

              {/* Sector Heatmap */}
              <div>
                <div style={{ fontSize: 11, fontFamily: SANS, color: C.textSec, fontWeight: 600, letterSpacing: "0.01em", marginBottom: 8 }}>
                  SECTOR HEATMAP
                </div>
                <SectorHeatmap data={sectorData} />
              </div>

              {/* Top Movers */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 5, padding: 14 }}>
                <div style={{ fontSize: 11, fontFamily: SANS, color: C.textSec, fontWeight: 600, letterSpacing: "0.01em", marginBottom: 10 }}>
                  WATCHLIST MOVERS
                </div>
                {[...watchlistData]
                  .sort((a, b) => Math.abs(b.changesPercentage || 0) - Math.abs(a.changesPercentage || 0))
                  .slice(0, 5)
                  .map(q => {
                    const chg = q.changesPercentage || 0;
                    const isUp = chg >= 0;
                    return (
                      <div key={q.symbol} onClick={() => setSelectedStock(q)} style={{
                        display: "flex", justifyContent: "space-between", padding: "4px 0",
                        borderBottom: `1px solid ${C.border}`, cursor: "pointer",
                      }}>
                        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.text }}>{q.symbol}</span>
                        <span style={{
                          fontFamily: MONO, fontSize: 10, fontWeight: 700,
                          color: isUp ? C.green : C.red,
                          padding: "1px 6px", borderRadius: 2,
                          background: isUp ? C.greenBg : C.redBg,
                        }}>
                          {isUp ? "+" : ""}{chg.toFixed(2)}%
                        </span>
                      </div>
                    );
                  })}
              </div>

              {/* News Wire */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 5, padding: 14 }}>
                <div style={{ fontSize: 11, fontFamily: SANS, color: C.textSec, fontWeight: 600, letterSpacing: "0.01em", marginBottom: 10 }}>
                  NEWS WIRE
                </div>
                {newsData.slice(0, 4).map((n, i) => (
                  <a key={`${n.ticker}-${i}`} href={n.link} target="_blank" rel="noreferrer" style={{
                    display: "block", textDecoration: "none", color: C.text, padding: "6px 0",
                    borderBottom: `1px solid ${C.border}`,
                  }}>
                    <div style={{ fontSize: 10, fontFamily: MONO, color: C.accent, marginBottom: 2 }}>
                      {n.ticker} · {n.publisher}
                    </div>
                    <div style={{ fontSize: 11, fontFamily: SANS, color: C.textSec, lineHeight: 1.35 }}>
                      {n.title}
                    </div>
                  </a>
                ))}
                {!newsData.length && <div style={{ fontSize: 11, color: C.textDim }}>No headlines yet.</div>}
              </div>
            </div>
          </div>
        )}

        {activeTab === "news" && (
          <div>
            <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em", marginBottom: 14 }}>
              NEWS DESK — LIVE HEADLINES
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {newsData.map((n, i) => (
                <a key={`${n.ticker}-${i}`} href={n.link} target="_blank" rel="noreferrer" style={{
                  display: "block", background: C.card, border: `1px solid ${C.border}`, borderRadius: 6,
                  padding: 12, textDecoration: "none",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: C.accent }}>{n.ticker} · {n.publisher}</span>
                    <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>
                      {n.publishedAt ? new Date(n.publishedAt).toLocaleString() : ""}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: C.text, fontWeight: 600, marginBottom: 4 }}>{n.title}</div>
                  {n.summary ? <div style={{ fontSize: 11, color: C.textSec }}>{n.summary}</div> : null}
                </a>
              ))}
              {!newsData.length && <div style={{ color: C.textDim, fontSize: 13 }}>No headlines loaded yet.</div>}
            </div>
          </div>
        )}

        {activeTab === "tv" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em" }}>
                LIVE MARKET TV
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {LIVE_TV_SOURCES.map((src) => (
                  <button
                    key={src.id}
                    onClick={() => setTvSource(src.id)}
                    style={{
                      border: `1px solid ${tvSource === src.id ? C.accent : C.border}`,
                      background: tvSource === src.id ? `${C.accent}12` : C.surface,
                      color: tvSource === src.id ? C.accent : C.text,
                      borderRadius: 4,
                      padding: "6px 10px",
                      fontFamily: MONO,
                      fontSize: 10,
                      cursor: "pointer",
                    }}
                  >
                    {src.label}
                  </button>
                ))}
                <button
                  onClick={() => window.open(selectedTvSource.official, "_blank", "noopener,noreferrer")}
                  style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 4, padding: "6px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                >
                  OPEN OFFICIAL
                </button>
              </div>
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
              <iframe
                title="live-market-tv"
                src={selectedTvSource.embed}
                style={{ width: "100%", height: "72vh", border: "none", borderRadius: 8, background: "#000" }}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
              <div style={{ marginTop: 8, fontSize: 11, color: C.textDim }}>
                If this stream is blocked by provider policy, use <b>OPEN OFFICIAL</b>.
              </div>
            </div>
          </div>
        )}

        {activeTab === "sectors" && (
          <div>
            <div style={{ fontSize: 10, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em", marginBottom: 14 }}>
              SECTOR PERFORMANCE — LIVE
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 12, display: "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.accent }}>WEATHER — ZIP {WEATHER_ZIP}</div>
                <button
                  onClick={fetchWeather}
                  style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 4, padding: "4px 8px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                >
                  {weatherLoading ? "UPDATING..." : "REFRESH"}
                </button>
              </div>
              {weatherError && <div style={{ fontSize: 12, color: C.red }}>{weatherError}</div>}
              {!weatherError && weatherData && (
                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr 1fr", gap: 8 }}>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}>
                    <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>{weatherData.location}</div>
                    <div style={{ fontFamily: MONO, fontSize: 19, fontWeight: 800, color: C.text }}>{weatherData.temp.toFixed(0)}°F</div>
                    <div style={{ fontSize: 11, color: C.textSec }}>{weatherCodeLabel(weatherData.code)}</div>
                  </div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}>
                    <div style={{ fontSize: 10, color: C.textDim }}>Feels</div>
                    <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700 }}>{weatherData.feelsLike.toFixed(0)}°F</div>
                  </div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}>
                    <div style={{ fontSize: 10, color: C.textDim }}>Wind</div>
                    <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700 }}>{weatherData.wind.toFixed(0)} mph</div>
                  </div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}>
                    <div style={{ fontSize: 10, color: C.textDim }}>High / Low</div>
                    <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700 }}>{weatherData.high.toFixed(0)}° / {weatherData.low.toFixed(0)}°</div>
                  </div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}>
                    <div style={{ fontSize: 10, color: C.textDim }}>Rain Chance</div>
                    <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: weatherData.rainChance >= 50 ? C.red : C.green }}>{weatherData.rainChance.toFixed(0)}%</div>
                  </div>
                </div>
              )}
              {!weatherError && !weatherData && <div style={{ fontSize: 12, color: C.textDim }}>Loading weather...</div>}
              {!weatherError && weatherData && (
                <div style={{ marginTop: 6, fontSize: 10, color: C.textDim }}>Updated {weatherData.updatedAt}</div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
              <div style={{ minWidth: 420, maxWidth: 560, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, color: C.accent }}>WEATHER ({WEATHER_ZIP})</div>
                  <button
                    onClick={fetchWeather}
                    style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 4, padding: "2px 6px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                  >
                    {weatherLoading ? "..." : "REFRESH"}
                  </button>
                </div>
                {weatherError && <div style={{ fontSize: 11, color: C.red }}>{weatherError}</div>}
                {!weatherError && !weatherData && <div style={{ fontSize: 11, color: C.textDim }}>Loading weather...</div>}
                {!weatherError && weatherData && (
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: C.text }}>{weatherData.temp.toFixed(0)}°F</span>
                    <span style={{ fontSize: 11, color: C.textSec }}>{weatherCodeLabel(weatherData.code)}</span>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>H/L {weatherData.high.toFixed(0)}°/{weatherData.low.toFixed(0)}°</span>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>Wind {weatherData.wind.toFixed(0)} mph</span>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: weatherData.rainChance >= 50 ? C.red : C.green }}>Rain {weatherData.rainChance.toFixed(0)}%</span>
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
              {[...sectorData]
                .sort((a, b) => (b.changesPercentage || 0) - (a.changesPercentage || 0))
                .map((q, i) => {
                  const chg = q.changesPercentage || 0;
                  const isUp = chg >= 0;
                  const isLeader = i < 3;
                  const isLagger = i >= sectorData.length - 3;
                  return (
                    <div key={q.symbol} style={{
                      background: C.card, borderRadius: 5, padding: 18,
                      border: `1px solid ${isLeader ? C.green + "40" : isLagger ? C.red + "30" : C.border}`,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text }}>{q.symbol}</span>
                        {isLeader && <Badge color={C.green}>LEADING</Badge>}
                        {isLagger && <Badge color={C.red}>LAGGING</Badge>}
                      </div>
                      <div style={{ fontFamily: SANS, fontSize: 11, color: C.textSec, marginBottom: 10 }}>{q._sectorName}</div>
                      <div style={{
                        fontFamily: MONO, fontSize: 26, fontWeight: 800,
                        color: isUp ? C.green : C.red, marginBottom: 8,
                      }}>
                        {isUp ? "+" : ""}{chg.toFixed(2)}%
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontFamily: MONO, color: C.textDim }}>
                        <span>${q.price?.toFixed(2)}</span>
                        <span>Vol: {q.volume ? (q.volume / 1e6).toFixed(1) + "M" : "—"}</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* Deep Dive */}
        {activeTab === "macro" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em" }}>
                MACRO DASHBOARD V2 — {macroTone.toUpperCase()}
              </div>
              <Badge color={macroTone.includes("Risk-On") ? C.green : macroTone.includes("Risk-Off") ? C.red : C.amber}>{macroTone}</Badge>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 10, marginBottom: 12 }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                <div style={{ padding: "9px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em" }}>ECONOMIC CALENDAR + COUNTDOWN</span>
                  <Badge color={macroEventAlerts.length ? C.red : C.green}>{macroEventAlerts.length ? "RISK WINDOW" : "CLEAR"}</Badge>
                </div>
                <div style={{ padding: 8, display: "grid", gap: 6 }}>
                  {macroEventCalendar.map((e) => (
                    <div key={e.id} style={{ border: `1px solid ${e.phase === "live" ? `${C.red}66` : e.phase === "imminent" ? `${C.amber}66` : C.border}`, borderRadius: 6, padding: "7px 8px", background: e.phase === "live" ? C.redBg : e.phase === "imminent" ? C.amberBg : C.surface }}>
                      <div style={{ display: "grid", gridTemplateColumns: "66px 1fr 110px 84px", gap: 8, alignItems: "center" }}>
                        <span style={{ fontFamily: MONO, fontSize: 10, color: C.accent, fontWeight: 700 }}>{e.tag}</span>
                        <span style={{ fontSize: 11, color: C.text, fontWeight: 600 }}>{e.title}</span>
                        <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>
                          {e.time.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </span>
                        <span style={{ fontFamily: MONO, fontSize: 10, color: e.phase === "live" ? C.red : e.phase === "imminent" ? C.amber : C.textSec, fontWeight: 700 }}>
                          {e.phase === "live" ? "LIVE" : formatCountdown(e.tteMs)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>AUTO RISK ACTIONS</div>
                <div style={{ fontSize: 11, color: C.textSec, marginBottom: 6 }}>
                  Next event: <span style={{ fontFamily: MONO, color: C.text, fontWeight: 700 }}>{macroEventCalendar[0]?.title || "N/A"}</span>
                </div>
                <div style={{ fontSize: 11, color: C.textSec, marginBottom: 8 }}>
                  Countdown: <span style={{ fontFamily: MONO, color: C.accent, fontWeight: 700 }}>{macroEventCalendar[0] ? formatCountdown(macroEventCalendar[0].tteMs) : "—"}</span>
                </div>
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 11, color: C.textSec }}>1. T-90m: no new oversized entries.</div>
                  <div style={{ fontSize: 11, color: C.textSec }}>2. T-30m: reduce beta and tighten stops.</div>
                  <div style={{ fontSize: 11, color: C.textSec }}>3. T+15m: wait for post-release structure before adds.</div>
                  <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>
                    Fed/CPI/Jobs/PCE/Minutes are estimated recurring schedule until provider calendar API is connected.
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, marginBottom: 12 }}>
              {[
                { k: "SPY", t: "US EQUITY RISK" },
                { k: "QQQ", t: "GROWTH BETA" },
                { k: "IWM", t: "SMALL-CAP BREADTH" },
                { k: "UUP", t: "USD PRESSURE" },
                { k: "USO", t: "OIL / INFLATION" },
                { k: "GLD", t: "DEFENSIVE METAL" },
                { k: "TLT", t: "LONG DURATION" },
                { k: "BTCUSD", t: "RISK SENTIMENT" },
                { k: "ETHUSD", t: "ALT LEADER" },
                { k: "SOLUSD", t: "HIGH-BETA ALT" },
              ].map(({ k, t }) => {
                const q = macroData.find((m) => m.symbol === k);
                if (!q) return null;
                const d1 = q.delta1d ?? q.changesPercentage ?? 0;
                const d7 = q.delta1w ?? 0;
                return (
                  <div key={k} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: C.text }}>{q._label || q.symbol}</span>
                      <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{t}</span>
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800 }}>${q.price?.toFixed(2)}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: d1 >= 0 ? C.green : C.red }}>1D {d1 >= 0 ? "+" : ""}{d1.toFixed(2)}%</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: d7 >= 0 ? C.green : C.red }}>1W {d7 >= 0 ? "+" : ""}{d7.toFixed(2)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10, marginBottom: 12 }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: C.text }}>BTC DOMINANCE (PROXY)</span>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>BTC / (BTC+ETH+SOL)</span>
                </div>
                <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, color: C.accent }}>
                  {Number(cryptoSnapshot.btcDomProxy || 0).toFixed(1)}%
                </div>
                <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 11, color: C.textSec }}>
                  Alt momentum spread:
                  <span style={{ color: Number(cryptoSnapshot.altStrength || 0) >= 0 ? C.green : C.red, fontWeight: 700, marginLeft: 6 }}>
                    {Number(cryptoSnapshot.altStrength || 0) >= 0 ? "+" : ""}{Number(cryptoSnapshot.altStrength || 0).toFixed(2)}%
                  </span>
                </div>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 11, color: C.text, marginBottom: 6 }}>CRYPTO COMPLEX</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {[
                    { k: "BTCUSD", t: "BTC" },
                    { k: "ETHUSD", t: "ETH" },
                    { k: "SOLUSD", t: "SOL" },
                  ].map(({ k, t }) => {
                    const q = macroData.find((m) => m.symbol === k);
                    const chg = Number(q?.changesPercentage || 0);
                    return (
                      <div key={`cx-${k}`} style={{ border: `1px solid ${C.border}`, borderRadius: 4, padding: 8, background: C.surface }}>
                        <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>{t}</div>
                        <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.text }}>
                          ${Number(q?.price || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </div>
                        <div style={{ fontFamily: MONO, fontSize: 10, color: chg >= 0 ? C.green : C.red }}>
                          {chg >= 0 ? "+" : ""}{chg.toFixed(2)}%
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: C.textSec, marginBottom: 10 }}>
              Regime filter: use macro tone first, then sector/stock relative strength, then entry trigger.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
              {macroData.map((q) => {
                const chg = q.changesPercentage || 0;
                const up = chg >= 0;
                return (
                  <div key={q.symbol} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: C.textSec }}>{q._label || q.symbol}</span>
                      <Badge color={up ? C.green : C.red}>{up ? "UP" : "DOWN"}</Badge>
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 30, fontWeight: 800, color: C.text }}>${q.price?.toFixed(2)}</div>
                    <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 15, color: up ? C.green : C.red, fontWeight: 700 }}>
                      {up ? "+" : ""}{chg.toFixed(2)}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "alerts" && (
          <div>
            <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em", marginBottom: 14 }}>
              ALERT CENTER — {combinedAlerts.length} LIVE SIGNALS
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                value={customAlertSymbol}
                onChange={(e) => setCustomAlertSymbol(e.target.value.toUpperCase())}
                placeholder="Custom symbol (e.g. NVDA)"
                style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 11, padding: "8px 10px", minWidth: 220 }}
              />
              <input
                value={customAlertMin}
                onChange={(e) => setCustomAlertMin(e.target.value)}
                placeholder="Min score"
                style={{ width: 110, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 11, padding: "8px 10px" }}
              />
              <button onClick={() => {
                const symbol = customAlertSymbol.trim().toUpperCase();
                const minScore = Math.max(1, Math.min(99, Number(customAlertMin || 70)));
                if (!symbol) return;
                setCustomAlerts((prev) => {
                  const next = prev.filter((x) => x.symbol !== symbol);
                  next.push({ symbol, minScore });
                  return next;
                });
                setCustomAlertSymbol("");
              }} style={{ background: C.card, border: `1px solid ${C.border}`, color: C.textSec, fontFamily: MONO, fontSize: 11, padding: "8px 10px", cursor: "pointer" }}>
                ADD CUSTOM ALERT
              </button>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {combinedAlerts.map((a, idx) => (
                <div key={`${a.symbol}-${idx}`} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: MONO, fontWeight: 800, fontSize: 14 }}>{a.symbol}</span>
                      <Badge color={a.type === "risk" ? C.red : a.type === "flow" ? C.amber : C.green}>{a.type}</Badge>
                    </div>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: C.textSec }}>Priority {a.score}</span>
                  </div>
                  <div style={{ fontSize: 13, color: C.textSec, marginBottom: 8 }}>{a.text}</div>
                  <ScoreBar value={a.score} color={a.type === "risk" ? C.red : a.type === "flow" ? C.amber : C.green} />
                </div>
              ))}
              {combinedAlerts.length === 0 && <div style={{ color: C.textDim, fontSize: 13 }}>No active alerts yet.</div>}
            </div>
          </div>
        )}

        {activeTab === "workflow" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em" }}>
                TRADER WORKFLOW - DAILY EXECUTION ENGINE
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <select
                  value={scannerFilters.scope}
                  onChange={(e) => setScannerFilters((s) => ({ ...s, scope: e.target.value }))}
                  style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 4, padding: "6px 8px", fontFamily: MONO, fontSize: 10 }}
                >
                  <option value="watchlist">WATCHLIST MODE</option>
                  <option value="market">MARKET-WIDE MODE</option>
                </select>
                {scannerFilters.scope === "market" && (
                  <button
                    onClick={loadMarketUniverse}
                    style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 4, padding: "6px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                  >
                    {marketUniverseLoading ? "LOADING..." : `UNIVERSE ${marketUniverseData.length}`}
                  </button>
                )}
                <button
                  onClick={runWorkflowAuto}
                  style={{ border: `1px solid ${C.border}`, background: C.accent, color: "#fff", borderRadius: 4, padding: "6px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                >
                  DO IT FOR ME
                </button>
                <button
                  onClick={() => { setWorkflowState(DEFAULT_WORKFLOW); setWorkflowAutoPlan(null); }}
                  style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 4, padding: "6px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                >
                  RESET DAY
                </button>
              </div>
            </div>
            {workflowAutoPlan && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Auto Plan</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.text }}>Created {workflowAutoPlan.createdAt}</div>
                  </div>
                  <div><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Scope</div><div style={{ fontFamily: MONO, fontSize: 12 }}>{String(workflowAutoPlan.scope || "watchlist").toUpperCase()}</div></div>
                  <div><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Primary</div><div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800 }}>{workflowAutoPlan.symbol}</div></div>
                  <div><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Inst. Score</div><div style={{ fontFamily: MONO, fontSize: 12, color: C.accent }}>{Number(workflowAutoPlan.score || 0).toFixed(1)}</div></div>
                  <div><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Entry</div><div style={{ fontFamily: MONO, fontSize: 12 }}>${Number(workflowAutoPlan.entry || 0).toFixed(2)}</div></div>
                  <div><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Stop</div><div style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>${Number(workflowAutoPlan.stop || 0).toFixed(2)}</div></div>
                  <div><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Target</div><div style={{ fontFamily: MONO, fontSize: 12, color: C.green }}>${Number(workflowAutoPlan.target || 0).toFixed(2)}</div></div>
                </div>
                <div style={{ marginBottom: 10, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px" }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 4 }}>WHY THIS NAME</div>
                  <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.45 }}>{workflowAutoPlan.why || "No rationale available."}</div>
                </div>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 6 }}>ALTERNATIVE CANDIDATES</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(180px, 1fr))", gap: 8 }}>
                    {(workflowAutoPlan.candidates || []).slice(0, 3).map((cand) => (
                      <div key={`cand-${cand.symbol}`} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, background: C.surface }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700 }}>{cand.symbol}</span>
                          <span style={{ fontFamily: MONO, fontSize: 11, color: C.accent }}>{Number(cand.score || 0).toFixed(1)}</span>
                        </div>
                        <div style={{ fontSize: 10, color: C.textDim, minHeight: 32 }}>{cand.why}</div>
                        {cand.symbol !== workflowAutoPlan.symbol && (
                          <button
                            onClick={() => applyWorkflowPrimary(cand)}
                            style={{ marginTop: 6, border: `1px solid ${C.border}`, background: C.card, color: C.text, borderRadius: 4, padding: "5px 8px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                          >
                            SET PRIMARY
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 4 }}>SESSION</div>
                <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.text }}>{marketSession}</div>
                <div style={{ fontSize: 11, color: C.textSec, marginTop: 6 }}>
                  Gainers: {sessionMovers.gainers.slice(0, 3).map((m) => m.symbol).join(", ") || "N/A"}
                </div>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 4 }}>BUY / UPGRADE</div>
                {(newsIntel.upgrades.slice(0, 2)).map((n, i) => (
                  <div key={`up-${i}`} style={{ fontSize: 11, color: C.green, marginBottom: 4 }}>{n.ticker}: {n.title.slice(0, 56)}</div>
                ))}
                {!newsIntel.upgrades.length && <div style={{ fontSize: 11, color: C.textDim }}>No bullish upgrade headlines.</div>}
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 4 }}>SELL / DOWNGRADE</div>
                {(newsIntel.downgrades.slice(0, 2)).map((n, i) => (
                  <div key={`dn-${i}`} style={{ fontSize: 11, color: C.red, marginBottom: 4 }}>{n.ticker}: {n.title.slice(0, 56)}</div>
                ))}
                {!newsIntel.downgrades.length && <div style={{ fontSize: 11, color: C.textDim }}>No bearish downgrade headlines.</div>}
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 4 }}>MACRO FLAGS</div>
                {(macroSignalFlags.red.slice(0, 2)).map((x, i) => <div key={`mr-${i}`} style={{ fontSize: 11, color: C.red, marginBottom: 3 }}>RED: {x}</div>)}
                {(macroSignalFlags.green.slice(0, 2)).map((x, i) => <div key={`mg-${i}`} style={{ fontSize: 11, color: C.green, marginBottom: 3 }}>GREEN: {x}</div>)}
                {!macroSignalFlags.red.length && !macroSignalFlags.green.length && <div style={{ fontSize: 11, color: C.textDim }}>No major macro flags.</div>}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(260px, 1fr))", gap: 12 }}>
              {[
                { key: "premarket", title: "PREMARKET PLAN", color: C.accent, subtitle: "Build bias before open" },
                { key: "live", title: "LIVE EXECUTION", color: C.green, subtitle: "Only validated setups" },
                { key: "postmarket", title: "POSTMARKET REVIEW", color: C.purple, subtitle: "Close loop and improve" },
              ].map((section) => (
                <div key={section.key} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: section.color }}>{section.title}</div>
                      <div style={{ fontSize: 10, color: C.textDim }}>{section.subtitle}</div>
                    </div>
                    <Badge color={workflowProgress[section.key].pct >= 100 ? C.green : C.amber}>
                      {workflowProgress[section.key].done}/{workflowProgress[section.key].total}
                    </Badge>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ height: 6, borderRadius: 4, background: C.border, overflow: "hidden" }}>
                      <div style={{ width: `${workflowProgress[section.key].pct}%`, height: "100%", background: section.color }} />
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
                    {(workflowState[section.key]?.checklist || []).map((item) => (
                      <label key={item.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 11, color: C.textSec }}>
                        <input
                          type="checkbox"
                          checked={Boolean(item.done)}
                          onChange={(e) => updateWorkflowCheck(section.key, item.id, e.target.checked)}
                          style={{ marginTop: 2 }}
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                  <textarea
                    value={workflowState[section.key]?.notes || ""}
                    onChange={(e) => updateWorkflowNotes(section.key, e.target.value)}
                    placeholder={`${section.title} notes...`}
                    style={{ width: "100%", minHeight: 90, resize: "vertical", background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: 8, fontFamily: SANS, fontSize: 12 }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "portfolio" && (
          <div>
            <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em", marginBottom: 14 }}>
              PORTFOLIO MANAGER - LIVE P/L TRACKER
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(140px, 1fr))", gap: 10, marginBottom: 12 }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Market Value</div>
                <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: C.text }}>{formatNum(portfolioSummary.totalValue)}</div>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Cost Basis</div>
                <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: C.text }}>{formatNum(portfolioSummary.totalCost)}</div>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Unrealized P/L</div>
                <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: portfolioSummary.totalPnl >= 0 ? C.green : C.red }}>
                  {portfolioSummary.totalPnl >= 0 ? "+" : ""}{formatNum(portfolioSummary.totalPnl)}
                </div>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Return %</div>
                <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: portfolioSummary.totalPnlPct >= 0 ? C.green : C.red }}>
                  {portfolioSummary.totalPnlPct >= 0 ? "+" : ""}{portfolioSummary.totalPnlPct.toFixed(2)}%
                </div>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Winners / Losers</div>
                <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: C.text }}>{portfolioSummary.winners} / {portfolioSummary.losers}</div>
              </div>
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>POSITIONS</span>
                <button
                  onClick={() => setPortfolioHoldings((prev) => [...prev, { symbol: "", shares: "0", avgCost: "0" }])}
                  style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 4, padding: "6px 8px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                >
                  ADD POSITION
                </button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: C.surface }}>
                      <th style={{ padding: "8px", textAlign: "left", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Ticker</th>
                      <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Shares</th>
                      <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Avg Cost</th>
                      <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Last</th>
                      <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Mkt Value</th>
                      <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>P/L</th>
                      <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>P/L %</th>
                      <th style={{ padding: "8px", textAlign: "center", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolioRows.map((row) => (
                      <tr key={`p-${row.idx}`}>
                        <td style={{ padding: "8px", borderTop: `1px solid ${C.border}` }}>
                          <input
                            value={portfolioHoldings[row.idx]?.symbol || ""}
                            onChange={(e) => setPortfolioHoldings((prev) => prev.map((h, i) => i === row.idx ? { ...h, symbol: e.target.value.toUpperCase() } : h))}
                            style={{ width: 90, background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "6px 8px", fontFamily: MONO, fontSize: 11 }}
                          />
                        </td>
                        <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right" }}>
                          <input
                            value={portfolioHoldings[row.idx]?.shares || ""}
                            onChange={(e) => setPortfolioHoldings((prev) => prev.map((h, i) => i === row.idx ? { ...h, shares: e.target.value.replace(/[^\d.]/g, "") } : h))}
                            style={{ width: 90, textAlign: "right", background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "6px 8px", fontFamily: MONO, fontSize: 11 }}
                          />
                        </td>
                        <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right" }}>
                          <input
                            value={portfolioHoldings[row.idx]?.avgCost || ""}
                            onChange={(e) => setPortfolioHoldings((prev) => prev.map((h, i) => i === row.idx ? { ...h, avgCost: e.target.value.replace(/[^\d.]/g, "") } : h))}
                            style={{ width: 100, textAlign: "right", background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "6px 8px", fontFamily: MONO, fontSize: 11 }}
                          />
                        </td>
                        <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.text }}>${(row.live?.price || 0).toFixed(2)}</td>
                        <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.text }}>{formatNum(row.marketValue)}</td>
                        <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 12, color: row.pnl >= 0 ? C.green : C.red }}>
                          {row.pnl >= 0 ? "+" : ""}{formatNum(row.pnl)}
                        </td>
                        <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 12, color: row.pnlPct >= 0 ? C.green : C.red }}>
                          {row.pnlPct >= 0 ? "+" : ""}{row.pnlPct.toFixed(2)}%
                        </td>
                        <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "center" }}>
                          <button
                            onClick={() => setPortfolioHoldings((prev) => prev.filter((_, i) => i !== row.idx))}
                            style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.red, borderRadius: 4, padding: "5px 8px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                          >
                            REMOVE
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!portfolioRows.length && (
                      <tr>
                        <td colSpan={8} style={{ padding: 14, textAlign: "center", color: C.textDim, fontSize: 12 }}>
                          Add positions to start tracking live P/L.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === "scanner" && (
          <div>
            <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em", marginBottom: 14 }}>
              SCANNER BUILDER - MOMENTUM + RELATIVE STRENGTH
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(120px, 1fr))", gap: 8, alignItems: "center" }}>
                <input value={scannerFilters.minPrice} onChange={(e) => setScannerFilters((s) => ({ ...s, minPrice: e.target.value.replace(/[^\d.]/g, "") }))} placeholder="Min Price" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }} />
                <input value={scannerFilters.minChange} onChange={(e) => setScannerFilters((s) => ({ ...s, minChange: e.target.value.replace(/[^\d.-]/g, "") }))} placeholder="Min |CHG%|" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }} />
                <input value={scannerFilters.minRvol} onChange={(e) => setScannerFilters((s) => ({ ...s, minRvol: e.target.value.replace(/[^\d.]/g, "") }))} placeholder="Min RVOL" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }} />
                <input value={scannerFilters.minScore} onChange={(e) => setScannerFilters((s) => ({ ...s, minScore: e.target.value.replace(/[^\d]/g, "") }))} placeholder="Min Score" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }} />
                <select value={scannerFilters.sector} onChange={(e) => setScannerFilters((s) => ({ ...s, sector: e.target.value }))} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }}>
                  <option value="ALL">All Sectors</option>
                  {SECTOR_ETFS.map((s) => <option key={s.symbol} value={s.symbol}>{s.symbol}</option>)}
                </select>
                <select value={scannerFilters.scope} onChange={(e) => setScannerFilters((s) => ({ ...s, scope: e.target.value }))} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }}>
                  <option value="watchlist">Watchlist Scope</option>
                  <option value="market">Market-Wide Scope</option>
                </select>
                <button onClick={() => { setLoading(true); fetchAll(apiKey).finally(() => setLoading(false)); }} style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 4, padding: "8px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}>
                  REFRESH SCAN
                </button>
              </div>
              {scannerFilters.scope === "market" && (
                <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 10, color: C.textDim }}>
                  Market universe: {marketUniverseData.length} symbols loaded {marketUniverseLoading ? "(loading...)" : ""}.
                  <button onClick={loadMarketUniverse} style={{ marginLeft: 8, border: `1px solid ${C.border}`, background: C.card, color: C.text, borderRadius: 4, padding: "4px 8px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}>
                    RELOAD UNIVERSE
                  </button>
                </div>
              )}
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 11, color: C.textDim }}>
                MATCHES: {scannerRows.length}
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: C.surface }}>
                      <th style={{ padding: "8px", textAlign: "left", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Symbol</th>
                      <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Price</th>
                      <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>CHG%</th>
                      <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>RVOL</th>
                      <th style={{ padding: "8px", textAlign: "left", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Sector</th>
                      <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Score</th>
                      <th style={{ padding: "8px", textAlign: "center", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Flow</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scannerRows.map((q) => {
                      const flow = flowBySymbol.find((f) => f.symbol === q.symbol);
                      const chg = Number(q.changesPercentage || 0);
                      return (
                        <tr key={`scan-${q.symbol}`}>
                          <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, fontFamily: MONO, fontWeight: 700, color: C.text }}>
                            <div>{q.symbol}</div>
                            <button
                              onClick={() => openTradingView(q.symbol)}
                              style={{ marginTop: 4, border: `1px solid ${C.border}`, background: C.surface, color: C.accent, borderRadius: 4, padding: "2px 6px", fontFamily: MONO, fontSize: 9, cursor: "pointer" }}
                            >
                              TV
                            </button>
                          </td>
                          <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, color: C.text }}>${q.price.toFixed(2)}</td>
                          <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, color: chg >= 0 ? C.green : C.red }}>{chg >= 0 ? "+" : ""}{chg.toFixed(2)}%</td>
                          <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, color: q.rvol >= 1.2 ? C.green : C.text }}>{q.rvol.toFixed(2)}x</td>
                          <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, fontFamily: MONO, color: C.textSec }}>{q.sectorEtf || "-"}</td>
                          <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, color: C.text }}>{q.scannerScore}</td>
                          <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "center" }}>
                            {flow ? <Badge color={Number(flow.callPutRatio || 1) >= 1 ? C.green : C.red}>C/P {Number(flow.callPutRatio || 0).toFixed(2)}</Badge> : <span style={{ color: C.textDim, fontSize: 10 }}>-</span>}
                          </td>
                        </tr>
                      );
                    })}
                    {!scannerRows.length && (
                      <tr>
                        <td colSpan={7} style={{ padding: 14, textAlign: "center", color: C.textDim, fontSize: 12 }}>
                          No symbols match current scanner filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === "backtest" && (
          <div>
            <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em", marginBottom: 14 }}>
              BACKTEST LAB - BREAKOUT + RISK MODEL
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 12, display: "grid", gridTemplateColumns: "180px 130px 130px auto", gap: 8, alignItems: "center" }}>
              <input value={backtestSymbol} onChange={(e) => setBacktestSymbol(e.target.value.toUpperCase())} placeholder="Ticker" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }} />
              <select value={backtestTf} onChange={(e) => setBacktestTf(e.target.value)} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }}>
                <option value="1D">1D</option>
                <option value="1H">1H</option>
                <option value="15M">15M</option>
                <option value="5M">5M</option>
              </select>
              <input value={backtestLookback} onChange={(e) => setBacktestLookback(e.target.value.replace(/[^\d]/g, ""))} placeholder="Breakout bars" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }} />
              <button onClick={runBacktest} style={{ justifySelf: "start", border: `1px solid ${C.border}`, background: C.surface, color: C.text, borderRadius: 4, padding: "8px 12px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}>
                {backtestLoading ? "RUNNING..." : "RUN BACKTEST"}
              </button>
            </div>

            {backtestResult?.error && (
              <div style={{ background: C.redBg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, color: C.red, marginBottom: 12, fontSize: 12 }}>
                {backtestResult.error}
              </div>
            )}

            {backtestResult && !backtestResult.error && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(140px, 1fr))", gap: 10, marginBottom: 12 }}>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Trades</div><div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800 }}>{backtestResult.totalTrades}</div></div>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Win Rate</div><div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: backtestResult.winRate >= 50 ? C.green : C.red }}>{backtestResult.winRate.toFixed(1)}%</div></div>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Avg Return</div><div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: backtestResult.avgRet >= 0 ? C.green : C.red }}>{backtestResult.avgRet >= 0 ? "+" : ""}{backtestResult.avgRet.toFixed(2)}%</div></div>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Net Return</div><div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: backtestResult.netRet >= 0 ? C.green : C.red }}>{backtestResult.netRet >= 0 ? "+" : ""}{backtestResult.netRet.toFixed(2)}%</div></div>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Max DD</div><div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: C.red }}>{backtestResult.maxDrawdown.toFixed(2)}%</div></div>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}><div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>Rule</div><div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800 }}>Breakout {backtestResult.lookback}</div></div>
                </div>

                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 11, color: C.textDim }}>RECENT TRADES</div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: C.surface }}>
                          <th style={{ padding: "8px", textAlign: "left", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Date</th>
                          <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Entry</th>
                          <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Stop</th>
                          <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Target</th>
                          <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Exit</th>
                          <th style={{ padding: "8px", textAlign: "center", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Outcome</th>
                          <th style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontSize: 10, color: C.textDim }}>Return %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {backtestResult.trades.map((t, i) => (
                          <tr key={`bt-${i}`}>
                            <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.textSec }}>{String(t.date || "").replace("T", " ").slice(0, 16)}</td>
                            <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 11 }}>${Number(t.entry || 0).toFixed(2)}</td>
                            <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 11 }}>${Number(t.stop || 0).toFixed(2)}</td>
                            <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 11 }}>${Number(t.target || 0).toFixed(2)}</td>
                            <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 11 }}>${Number(t.exit || 0).toFixed(2)}</td>
                            <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "center" }}>
                              <Badge color={t.outcome === "target" ? C.green : t.outcome === "stop" ? C.red : C.amber}>{String(t.outcome || "").toUpperCase()}</Badge>
                            </td>
                            <td style={{ padding: "8px", borderTop: `1px solid ${C.border}`, textAlign: "right", fontFamily: MONO, fontSize: 11, color: Number(t.retPct || 0) >= 0 ? C.green : C.red }}>
                              {Number(t.retPct || 0) >= 0 ? "+" : ""}{Number(t.retPct || 0).toFixed(2)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "flow" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em" }}>
                OPTIONS FLOW — UNUSUAL ACTIVITY
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Badge color={String(optionsFlow?.source || "").includes("estimated") ? C.amber : C.green}>
                  {String(optionsFlow?.source || "").includes("estimated") ? "ESTIMATED" : "LIVE"}
                </Badge>
                <Badge color={flowBias === "CALL BIAS" ? C.green : flowBias === "PUT BIAS" ? C.red : C.amber}>{flowBias}</Badge>
                <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>
                  Calls {formatNum(flowCallNotional)} · Puts {formatNum(flowPutNotional)}
                </span>
              </div>
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginBottom: 8 }}>FLOW FILTERS</div>
              <div style={{ display: "grid", gridTemplateColumns: "160px 140px 170px 180px auto", gap: 8, alignItems: "center" }}>
                <select
                  value={flowFilters.flowType}
                  onChange={(e) => setFlowFilters((prev) => ({ ...prev, flowType: e.target.value }))}
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }}
                >
                  <option value="all">All Flow</option>
                  <option value="sweep">Sweeps</option>
                  <option value="darkpool">Dark Pool</option>
                  <option value="block">Block</option>
                </select>
                <input
                  value={flowFilters.minNotional}
                  onChange={(e) => setFlowFilters((prev) => ({ ...prev, minNotional: e.target.value.replace(/[^\d]/g, "") }))}
                  placeholder="Min notional"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }}
                />
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: MONO, fontSize: 11, color: C.textSec }}>
                  <input
                    type="checkbox"
                    checked={Boolean(flowFilters.unusualOnly)}
                    onChange={(e) => setFlowFilters((prev) => ({ ...prev, unusualOnly: e.target.checked }))}
                  />
                  Unusual only
                </label>
                <input
                  value={flowFilters.autoAlertNotional}
                  onChange={(e) => setFlowFilters((prev) => ({ ...prev, autoAlertNotional: e.target.value.replace(/[^\d]/g, "") }))}
                  placeholder="Auto-alert threshold"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }}
                />
                <button
                  onClick={() => { setLoading(true); fetchAll(apiKey).finally(() => setLoading(false)); }}
                  style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, padding: "8px 10px", borderRadius: 4, fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                >
                  APPLY
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.9fr", gap: 12 }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 11, color: C.textDim }}>
                  BY SYMBOL
                </div>
                <div>
                  {flowBySymbol.map((row) => (
                    <div key={row.symbol} style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontFamily: MONO, fontSize: 13, color: C.text, fontWeight: 700 }}>{row.symbol}</span>
                        <Badge color={Number(row.callPutRatio || 0) >= 1 ? C.green : C.red}>C/P {Number(row.callPutRatio || 0).toFixed(2)}</Badge>
                      </div>
                      <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>Expiry {row.expiration || "—"}</div>
                    </div>
                  ))}
                  {!flowBySymbol.length && <div style={{ padding: 12, color: C.textDim, fontSize: 12 }}>No options flow yet.</div>}
                </div>
              </div>

              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 11, color: C.textDim }}>
                  TOP FLOW TAPE
                </div>
                <div>
                  {flowRows.map((row, idx) => (
                    <div key={`${row.symbol}-${row.side}-${row.strike}-${idx}`} style={{ display: "grid", gridTemplateColumns: "62px 52px 70px 70px 72px 90px 88px 82px", gap: 8, alignItems: "center", padding: "9px 12px", borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: C.text, fontWeight: 700 }}>{row.symbol}</span>
                      <Badge color={row.side === "CALL" ? C.green : C.red}>{row.side}</Badge>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: C.text }}>K {Number(row.strike || 0).toFixed(0)}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim }}>{row.expiry || "—"}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: C.textSec }}>Vol {row.volume || 0}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: C.textSec }}>OI {row.openInterest || 0}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: C.text }}>{formatNum(row.notional || 0)}</span>
                      <Badge color={row.unusual ? C.amber : C.textDim}>{row.tradeType || "TAPE"}</Badge>
                    </div>
                  ))}
                  {!flowRows.length && <div style={{ padding: 12, color: C.textDim, fontSize: 12 }}>No flow tape available yet.</div>}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "rotation" && (
          <div>
            <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em", marginBottom: 14 }}>
              ROTATION ENGINE — CAPITAL FLOW RANKING
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
              {[...rotationRank].slice(0, 12).map((q, idx) => (
                <div key={q.symbol} style={{ display: "grid", gridTemplateColumns: "56px 1fr 150px 128px 116px", gap: 12, alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontFamily: MONO, color: C.textDim, fontSize: 12 }}>#{idx + 1}</span>
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700 }}>{q.symbol}</div>
                    <div style={{ fontSize: 12, color: C.textDim }}>{q.name}</div>
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 15, color: q.relVsSpy >= 0 ? C.green : C.red, fontWeight: 700 }}>
                    RS vs SPY {q.relVsSpy >= 0 ? "+" : ""}{q.relVsSpy.toFixed(2)}%
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 15, color: C.textSec, fontWeight: 700 }}>
                    RVOL {q.rvol.toFixed(2)}x
                  </div>
                  <Badge color={idx < 3 ? C.green : idx > 8 ? C.red : C.amber}>
                    {idx < 3 ? "LEADER" : idx > 8 ? "LAGGER" : "NEUTRAL"}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "tools" && (
          <div>
            <div style={{ fontSize: 12, fontFamily: MONO, color: C.textDim, letterSpacing: "0.08em", marginBottom: 14 }}>
              PRO TOOLBOX — EXECUTION DISCIPLINE
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12, marginBottom: 12 }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.accent }}>Position Sizing Engine Pro</div>
                  <Badge color={riskPlan.regime === "Risk-On" || riskPlan.regime === "Goldilocks" ? C.green : riskPlan.regime === "Risk-Off" ? C.red : C.amber}>
                    {riskPlan.regime}
                  </Badge>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(100px, 1fr))", gap: 8, marginBottom: 8 }}>
                  <input value={riskAccount} onChange={(e) => setRiskAccount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Account $" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }} />
                  <input value={riskPct} onChange={(e) => setRiskPct(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Risk %" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }} />
                  <input value={riskEntry} onChange={(e) => setRiskEntry(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Entry" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }} />
                  <input value={riskStop} onChange={(e) => setRiskStop(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Stop" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }} />
                  <select value={riskSide} onChange={(e) => setRiskSide(e.target.value)} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }}>
                    <option value="long">Long</option>
                    <option value="short">Short</option>
                  </select>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(100px, 1fr))", gap: 8, marginBottom: 10 }}>
                  <input value={riskMaxPosPct} onChange={(e) => setRiskMaxPosPct(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Max Pos %" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }} />
                  <input value={riskCorrCap} onChange={(e) => setRiskCorrCap(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Corr Cap 0-1" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }} />
                  <input value={riskAtrPct} onChange={(e) => setRiskAtrPct(e.target.value.replace(/[^\d.]/g, ""))} placeholder="ATR % Proxy" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }} />
                  <input value={riskSlipBps} onChange={(e) => setRiskSlipBps(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Slip bps" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }} />
                  <select value={riskSetupQuality} onChange={(e) => setRiskSetupQuality(e.target.value)} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }}>
                    <option value="A+">A+ Setup</option>
                    <option value="A">A Setup</option>
                    <option value="B">B Setup</option>
                    <option value="C">C Setup</option>
                  </select>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 8 }}>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}><div style={{ fontSize: 9, color: C.textDim, fontFamily: MONO }}>Risk Budget $ (Adj)</div><div style={{ fontFamily: MONO, fontSize: 14, color: C.text }}>${riskPlan.riskDollars.toFixed(2)}</div></div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}><div style={{ fontSize: 9, color: C.textDim, fontFamily: MONO }}>Per-share Risk</div><div style={{ fontFamily: MONO, fontSize: 14, color: C.text }}>${riskPlan.perShare.toFixed(2)}</div></div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}><div style={{ fontSize: 9, color: C.textDim, fontFamily: MONO }}>Final Size (Shares)</div><div style={{ fontFamily: MONO, fontSize: 14, color: C.accent, fontWeight: 700 }}>{riskPlan.shares}</div></div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}><div style={{ fontSize: 9, color: C.textDim, fontFamily: MONO }}>Position $</div><div style={{ fontFamily: MONO, fontSize: 14, color: C.text }}>${riskPlan.position.toFixed(0)}</div></div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}><div style={{ fontSize: 9, color: C.textDim, fontFamily: MONO }}>Est. $ Risk</div><div style={{ fontFamily: MONO, fontSize: 13, color: C.red }}>${riskPlan.estRisk.toFixed(2)}</div></div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}><div style={{ fontSize: 9, color: C.textDim, fontFamily: MONO }}>T1 (1R)</div><div style={{ fontFamily: MONO, fontSize: 13, color: C.green }}>${riskPlan.t1.toFixed(2)}</div></div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}><div style={{ fontSize: 9, color: C.textDim, fontFamily: MONO }}>T2 (2R)</div><div style={{ fontFamily: MONO, fontSize: 13, color: C.green }}>${riskPlan.t2.toFixed(2)}</div></div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}><div style={{ fontSize: 9, color: C.textDim, fontFamily: MONO }}>Stop Distance</div><div style={{ fontFamily: MONO, fontSize: 13, color: C.text }}>{riskPlan.stopPct.toFixed(2)}%</div></div>
                </div>
                <div style={{ marginTop: 8, borderTop: `1px solid ${C.border}`, paddingTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <div style={{ fontSize: 10, color: C.textSec }}>Base Risk Budget: <span style={{ fontFamily: MONO, color: C.text }}>${riskPlan.baseRiskDollars.toFixed(2)}</span></div>
                  <div style={{ fontSize: 10, color: C.textSec }}>Regime Mult: <span style={{ fontFamily: MONO, color: C.text }}>{riskPlan.regimeMult.toFixed(2)}x</span> · Quality: <span style={{ fontFamily: MONO, color: C.text }}>{riskPlan.qualityMult.toFixed(2)}x</span></div>
                  <div style={{ fontSize: 10, color: C.textSec }}>Vol Adj: <span style={{ fontFamily: MONO, color: C.text }}>{riskPlan.volAdj.toFixed(2)}x</span> · Corr Cap: <span style={{ fontFamily: MONO, color: C.text }}>{riskPlan.corrCap.toFixed(2)}x</span></div>
                </div>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.accent, marginBottom: 10 }}>Live Opportunity Scanner</div>
                {scannerRank.map((q, i) => (
                  <div key={`${q.symbol}-${i}`} style={{ display: "grid", gridTemplateColumns: "56px 1fr 66px", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: C.text }}>{q.symbol}</span>
                    <span style={{ fontSize: 11, color: C.textSec }}>5m {q.delta5m >= 0 ? "+" : ""}{(q.delta5m || 0).toFixed(2)}% · RS {q.rel >= 0 ? "+" : ""}{q.rel.toFixed(2)}%</span>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: q.score >= 8 ? C.green : q.score >= 3 ? C.amber : C.red, textAlign: "right" }}>{q.score.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 12 }}>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.accent, marginBottom: 10 }}>Data Provider Keys (Local)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <input
                  type="password"
                  value={providerKeys.finnhubKey}
                  onChange={(e) => setProviderKeys((prev) => ({ ...prev, finnhubKey: e.target.value.trim() }))}
                  placeholder="Finnhub API Key"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }}
                />
                <input
                  type="password"
                  value={providerKeys.fmpKey}
                  onChange={(e) => setProviderKeys((prev) => ({ ...prev, fmpKey: e.target.value.trim() }))}
                  placeholder="FMP API Key"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }}
                />
                <input
                  type="password"
                  value={providerKeys.polygonKey}
                  onChange={(e) => setProviderKeys((prev) => ({ ...prev, polygonKey: e.target.value.trim() }))}
                  placeholder="Polygon API Key"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "center" }}>
                <input
                  type="password"
                  value={providerKeys.uwKey}
                  onChange={(e) => setProviderKeys((prev) => ({ ...prev, uwKey: e.target.value.trim() }))}
                  placeholder="Unusual Whales API Key"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }}
                />
                <input
                  type="password"
                  value={providerKeys.tradierKey}
                  onChange={(e) => setProviderKeys((prev) => ({ ...prev, tradierKey: e.target.value.trim() }))}
                  placeholder="Tradier API Key (Options Flow)"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", fontFamily: MONO, fontSize: 11 }}
                />
                <button
                  onClick={() => { setLoading(true); fetchAll(apiKey).finally(() => setLoading(false)); }}
                  style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.text, padding: "8px 10px", borderRadius: 4, fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                >
                  APPLY
                </button>
              </div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 8 }}>
                Keys are saved in local storage on this browser only. Add Polygon, Unusual Whales, and Tradier keys for richer options flow and provider coverage.
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {[
                {
                  t: "Risk Calculator",
                  d: "Set max risk per trade (0.5%–1%), derive share size from stop distance before entry.",
                },
                {
                  t: "Technical Trigger Matrix",
                  d: "Require 3 of 5: trend alignment, RVOL > 1.2, RS > 0, reclaim/hold key average, clean structure.",
                },
                {
                  t: "Fundamental Quality Check",
                  d: "Check revenue/EPS trend, balance sheet, margins, and catalyst window before scaling position size.",
                },
                {
                  t: "Macro Gate",
                  d: "Only take aggressive longs when macro tone is Risk-On; reduce size when regime conflicts.",
                },
                {
                  t: "Rotation Checklist",
                  d: "Confirm stock > sector ETF and sector ETF > SPY before rotating capital to a new leader.",
                },
                {
                  t: "Post-Trade Journal",
                  d: "Log setup type, regime, entry/exit, invalidation respect, and lesson to improve process edge.",
                },
              ].map((x) => (
                <div key={x.t} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.accent, marginBottom: 8 }}>{x.t}</div>
                  <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.45 }}>{x.d}</div>
                </div>
              ))}
            </div>
          </div>
        )}

      {marketReportOpen && (
        <div onClick={() => setMarketReportOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(8,18,34,0.24)", zIndex: 1250, display: "grid", placeItems: "start center", paddingTop: "10vh" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 960, maxWidth: "94vw", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 24px 60px rgba(15,27,45,0.18)", overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: C.text, fontWeight: 700 }}>MARKET OVERALL REPORT</div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginTop: 2 }}>{marketReportGeneratedAt || "Now"}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => {
                    try { navigator.clipboard.writeText(marketReportText || ""); } catch {}
                  }}
                  style={{ border: `1px solid ${C.border}`, background: C.card, color: C.textSec, borderRadius: 4, padding: "6px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                >
                  COPY
                </button>
                <button
                  onClick={() => setMarketReportOpen(false)}
                  style={{ border: `1px solid ${C.border}`, background: C.card, color: C.textSec, borderRadius: 4, padding: "6px 10px", fontFamily: MONO, fontSize: 10, cursor: "pointer" }}
                >
                  CLOSE
                </button>
              </div>
            </div>
            <div style={{ padding: 14, maxHeight: "72vh", overflow: "auto", background: C.bg }}>
              {!marketReportData ? (
                <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: MONO, fontSize: 12, lineHeight: 1.6, color: C.text }}>
                  {marketReportText || "No report yet. Click MARKET REPORT to generate."}
                </pre>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.accent, marginBottom: 8 }}>MARKET OVERVIEW</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ background: `${C.accent}12`, border: `1px solid ${C.accent}33`, color: C.accent, borderRadius: 999, padding: "4px 10px", fontFamily: MONO, fontSize: 11, fontWeight: 700 }}>Session {marketReportData.session}</span>
                      <span style={{ background: `${marketReportData.regime === "Risk-On" ? C.green : marketReportData.regime === "Risk-Off" ? C.red : C.amber}12`, border: `1px solid ${marketReportData.regime === "Risk-On" ? C.green : marketReportData.regime === "Risk-Off" ? C.red : C.amber}33`, color: marketReportData.regime === "Risk-On" ? C.green : marketReportData.regime === "Risk-Off" ? C.red : C.amber, borderRadius: 999, padding: "4px 10px", fontFamily: MONO, fontSize: 11, fontWeight: 800 }}>Regime {marketReportData.regime}</span>
                      <span style={{ background: `${C.purple}12`, border: `1px solid ${C.purple}33`, color: C.purple, borderRadius: 999, padding: "4px 10px", fontFamily: MONO, fontSize: 11, fontWeight: 700 }}>Tone {marketReportData.macroTone}</span>
                    </div>
                  </div>

                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.cyan, marginBottom: 8 }}>INDEX + MACRO SNAPSHOT</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {(marketReportData.indexRows || []).map((r) => {
                        const positive = r.invert ? r.value <= 0 : r.value >= 0;
                        const tone = positive ? C.green : C.red;
                        return (
                          <span key={`idx-${r.label}`} style={{ background: positive ? C.greenBg : C.redBg, border: `1px solid ${tone}33`, color: tone, borderRadius: 999, padding: "4px 10px", fontFamily: MONO, fontSize: 11, fontWeight: 800 }}>
                            {r.label} {r.value >= 0 ? "+" : ""}{r.value.toFixed(2)}%
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.green, marginBottom: 8 }}>BREADTH + LEADERSHIP</div>
                      <div style={{ fontSize: 12, color: C.textSec, marginBottom: 8 }}><b>Breadth:</b> {marketReportData.breadth.advancers} advancers / {marketReportData.breadth.decliners} decliners ({marketReportData.breadth.breadthPct}% positive)</div>
                      <div style={{ fontSize: 12, marginBottom: 6 }}><b>Top gainers:</b> {(marketReportData.topGainers || []).map((q) => <span key={`g-${q.symbol}`} style={{ color: C.green, fontWeight: 700, marginRight: 8 }}>{q.symbol} {q.changesPercentage >= 0 ? "+" : ""}{Number(q.changesPercentage || 0).toFixed(2)}%</span>)}</div>
                      <div style={{ fontSize: 12, marginBottom: 6 }}><b>Top losers:</b> {(marketReportData.topLosers || []).map((q) => <span key={`l-${q.symbol}`} style={{ color: C.red, fontWeight: 700, marginRight: 8 }}>{q.symbol} {Number(q.changesPercentage || 0).toFixed(2)}%</span>)}</div>
                      <div style={{ fontSize: 12 }}><b>Sector leaders:</b> {(marketReportData.sectorLeaders || []).map((s) => <span key={`sl-${s.symbol}`} style={{ color: C.green, fontWeight: 700, marginRight: 8 }}>{s.symbol} {Number(s.changesPercentage || 0) >= 0 ? "+" : ""}{Number(s.changesPercentage || 0).toFixed(2)}%</span>)}</div>
                    </div>
                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.red, marginBottom: 8 }}>RISK + FLOW + ALERTS</div>
                      <div style={{ fontSize: 12, marginBottom: 6 }}><b>Macro green:</b> {(marketReportData.macroGreen || []).join(" | ") || "None"}</div>
                      <div style={{ fontSize: 12, marginBottom: 6 }}><b>Macro red:</b> {(marketReportData.macroRed || []).join(" | ") || "None"}</div>
                      <div style={{ fontSize: 12, marginBottom: 6 }}><b>Flow bias:</b> <span style={{ color: marketReportData.flowBias === "CALL BIAS" ? C.green : marketReportData.flowBias === "PUT BIAS" ? C.red : C.amber, fontWeight: 800 }}>{marketReportData.flowBias}</span></div>
                      <div style={{ fontSize: 12, marginBottom: 6 }}><b>Call vs Put:</b> <span style={{ color: C.green, fontWeight: 700 }}>{formatNum(marketReportData.flowCallNotional)}</span> / <span style={{ color: C.red, fontWeight: 700 }}>{formatNum(marketReportData.flowPutNotional)}</span></div>
                      <div style={{ fontSize: 12 }}><b>Priority alerts:</b> {(marketReportData.priAlerts || []).map((a, idx) => <span key={`a-${idx}`} style={{ color: C.amber, fontWeight: 800, marginRight: 8 }}>{a.symbol}({a.score})</span>)}</div>
                    </div>
                  </div>

                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.purple, marginBottom: 8 }}>NEWS + EXECUTION FOCUS</div>
                    <div style={{ fontSize: 12, marginBottom: 8 }}>
                      <b>Upgrades:</b> <span style={{ color: C.green, fontWeight: 800 }}>{marketReportData.upgradesCount}</span> | <b>Downgrades:</b> <span style={{ color: C.red, fontWeight: 800 }}>{marketReportData.downgradesCount}</span>
                    </div>
                    <div style={{ display: "grid", gap: 4, marginBottom: 10 }}>
                      {(marketReportData.headlines || []).map((n, i) => (
                        <div key={`h-${i}`} style={{ fontSize: 12, color: C.textSec }}>
                          <span style={{ fontFamily: MONO, color: C.accent, fontWeight: 700 }}>{i + 1}. {n.ticker || "MKT"}</span> - <span style={{ fontWeight: 600 }}>{n.title || "Headline unavailable"}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 12, marginBottom: 6 }}>
                      <b>Rotation leaders:</b> {(marketReportData.rotationTop || []).map((q) => (
                        <span key={`r-${q.symbol}`} style={{ marginRight: 8 }}>
                          <span style={{ fontWeight: 800 }}>{q.symbol}</span>
                          <span style={{ color: Number(q.relVsSpy || 0) >= 0 ? C.green : C.red, fontWeight: 700 }}> RS {Number(q.relVsSpy || 0) >= 0 ? "+" : ""}{Number(q.relVsSpy || 0).toFixed(2)}%</span>
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: 12, marginBottom: 6 }}>
                      <b>Earnings watch:</b> {(marketReportData.earningsWatch || []).map((e, idx) => {
                        const isUpcoming = Number.isFinite(e.dayDiff) && e.dayDiff >= 0 && e.dayDiff <= 7;
                        const tone = isUpcoming ? C.amber : C.textSec;
                        return (
                          <span key={`earn-${idx}`} style={{ marginRight: 8, color: tone }}>
                            <span style={{ fontWeight: 800 }}>{e.symbol}</span> {e.timing}
                          </span>
                        );
                      })}
                      {!marketReportData.earningsWatch?.length && <span style={{ color: C.textDim }}> No earnings dates available.</span>}
                    </div>
                    <div style={{ fontSize: 12, color: C.textSec }}><b>Posture:</b> <span style={{ fontWeight: 700 }}>{marketReportData.posture}</span></div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {paletteOpen && (
        <div onClick={() => setPaletteOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(8,18,34,0.18)", zIndex: 1200, display: "grid", placeItems: "start center", paddingTop: "14vh" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 680, maxWidth: "92vw", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 24px 60px rgba(15,27,45,0.18)" }}>
            <div style={{ padding: 12, borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 8 }}>AXIOM COMMAND PALETTE (GO)</div>
              <input
                autoFocus
                value={paletteInput}
                onChange={(e) => setPaletteInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    runPaletteCommand(paletteInput);
                    setPaletteOpen(false);
                    setPaletteInput("");
                  }
                }}
                placeholder="Examples: NVDA GO | MACRO GO | TERMINAL GO | TF 15M GO"
                style={{ width: "100%", background: C.bg, border: `1px solid ${C.border}`, color: C.text, fontFamily: MONO, fontSize: 12, padding: "10px 12px", borderRadius: 6 }}
              />
            </div>
            <div style={{ padding: "10px 12px", display: "grid", gap: 4 }}>
              {["NVDA GO", "MACRO GO", "NEWS GO", "TV GO", "ALERTS GO", "WORKFLOW GO", "FLOW GO", "PORTFOLIO GO", "SCANNER GO", "BACKTEST GO", "TERMINAL GO", "TF 5M GO", "TF 1D GO", "LAYOUT 2 GO", "LAYOUT 4 GO"].map((cmd) => (
                <button key={cmd} onClick={() => { runPaletteCommand(cmd); setPaletteOpen(false); setPaletteInput(""); }} style={{ textAlign: "left", border: `1px solid ${C.border}`, background: C.card, borderRadius: 6, padding: "8px 10px", cursor: "pointer", fontFamily: MONO, fontSize: 11, color: C.textSec }}>
                  {cmd}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedStock && (
        <DeepDive
          stock={selectedStock}
          fundamentals={selectedFundamentals}
          onClose={() => setSelectedStock(null)}
          onExit={() => { setSelectedStock(null); setActiveTab("dashboard"); }}
          onOpenTradingView={openTradingView}
        />
      )}

      <style>{`
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.3 } }
        @keyframes axiomTickerLTR { 0% { transform: translateX(-55%); } 100% { transform: translateX(100%); } }
        .axiom-ticker-track:hover { animation-play-state: paused; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: ${C.bg}; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
        table { border-spacing: 0; }
      `}</style>
    </div>
  );
}


