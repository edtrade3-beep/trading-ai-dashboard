/**
 * Smoke tests — pure function checks, no network, no server required.
 * Run: node test/smoke.js
 */

const crypto = require("node:crypto");

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    failed++;
  }
}

function assertEq(label, actual, expected) {
  const ok = actual === expected;
  if (ok) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}  →  expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ─── Inline copies of pure functions under test ──────────────────────────────
// We inline them here so the test file has zero require() calls into src/,
// making it runnable without the full server environment.

function round2(value) {
  return Math.round(value * 100) / 100;
}

function monthlyPayment(amount, apr, months, downPayment) {
  const principal = Math.max(Number(amount || 0) - Number(downPayment || 0), 0);
  const rate = Number(apr || 0) / 100 / 12;
  const term = Math.max(Number(months || 72), 1);
  if (!principal) return 0;
  if (!rate) return Math.round(principal / term);
  return Math.round((principal * rate) / (1 - Math.pow(1 + rate, -term)));
}

function safeCompare(submitted, stored) {
  const a = Buffer.from(String(submitted));
  const b = Buffer.from(String(stored));
  if (a.length !== b.length) {
    crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function normalizeVin(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17);
}

function estimatePrice(vehicle) {
  const currentYear = new Date().getFullYear();
  const age = Math.max(currentYear - Number(vehicle.year || currentYear), 0);
  const mileage = Number(vehicle.mileage || 0);
  const price = Number(vehicle.price || 0);
  const make = String(vehicle.make || "").toLowerCase();
  const model = String(vehicle.model || "").toLowerCase();
  const condition = vehicle.condition || "Good";

  let base = 31000 - age * 2100;
  if (["toyota", "honda", "lexus", "acura"].includes(make)) base *= 1.08;
  if (["chevrolet", "ford", "gmc"].includes(make)) base *= 1.03;
  if (model.includes("tahoe") || model.includes("truck")) base *= 1.1;
  base -= Math.max(mileage - 60000, 0) * 0.05;
  base *= ({ Excellent: 1.08, "Very Good": 1.04, Good: 1, Fair: 0.92, Rough: 0.84 }[condition] || 1);
  if (price > 0) base = base * 0.72 + price * 0.28;

  const suggested = Math.max(Math.round(base / 100) * 100, 4000);
  const low = Math.round(suggested * 0.95);
  const high = Math.round(suggested * 1.1);
  const cleanTrade = Math.round(suggested * 0.87);
  const roughTrade = Math.round(suggested * 0.78);
  const recon = Math.round(Math.max(500, suggested * 0.03));
  const pack = 995;
  const totalCost = cleanTrade + recon + pack;
  const frontEnd = Math.max(high - totalCost, 0);
  const ratio = cleanTrade > 0 ? totalCost / cleanTrade : 0;

  return { suggested, low, high, cleanTrade, roughTrade, recon, pack, totalCost, frontEnd, ratio };
}

function filterFlowRows(rows, filters) {
  const flowType = String(filters?.flowType || "all").toLowerCase();
  const minNotional = Math.max(0, Number(filters?.minNotional || 0));
  const unusualOnly = Boolean(filters?.unusualOnly);
  return (rows || []).filter((row) => {
    if (Number(row?.notional || 0) < minNotional) return false;
    if (unusualOnly && !row?.unusual) return false;
    if (flowType === "sweep" && row?.tradeType !== "SWEEP") return false;
    return true;
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

console.log("\n── round2 ──");
// 1.005 * 100 = 100.499... in IEEE 754, so it rounds to 1.00 — expected behaviour
assertEq("1.005 rounds to 1 (IEEE 754)", round2(1.005), 1);
assertEq("1.006 rounds to 1.01", round2(1.006), 1.01);
assertEq("rounds down", round2(1.004), 1);
assertEq("preserves whole numbers", round2(42), 42);
assertEq("negative value", round2(-3.456), -3.46);

console.log("\n── monthlyPayment ──");
assertEq("zero principal → 0", monthlyPayment(0, 9.9, 72, 0), 0);
assertEq("fully covered by down payment → 0", monthlyPayment(5000, 9.9, 72, 5000), 0);
assertEq("0% APR splits evenly", monthlyPayment(7200, 0, 72, 0), 100);
// $18,995 at 9.9% APR, 72 months, $3,000 down → principal $15,995
const pmt = monthlyPayment(18995, 9.9, 72, 3000);
assert("realistic payment is positive", pmt > 0);
assert("realistic payment in plausible range ($200–$400)", pmt >= 200 && pmt <= 400);

console.log("\n── safeCompare ──");
assertEq("matching passwords → true", safeCompare("secret123", "secret123"), true);
assertEq("wrong password → false", safeCompare("wrong", "secret123"), false);
assertEq("empty vs non-empty → false", safeCompare("", "secret"), false);
assertEq("both empty → true", safeCompare("", ""), true);
assertEq("different lengths → false", safeCompare("abc", "abcd"), false);

console.log("\n── normalizeVin ──");
assertEq("strips special chars", normalizeVin("1HG-CM82633A"), "1HGCM82633A");
assertEq("lowercases to upper", normalizeVin("1hgcm82633a123456"), "1HGCM82633A123456");
assertEq("truncates to 17", normalizeVin("1HGCM82633A123456789"), "1HGCM82633A123456");
assertEq("empty → empty string", normalizeVin(""), "");

console.log("\n── estimatePrice ──");
const hondaPrice = estimatePrice({ year: 2019, make: "Honda", model: "Accord", trim: "Sport", mileage: 85000, condition: "Good", price: 18995 });
assert("suggested > 0", hondaPrice.suggested > 0);
assert("high > suggested > low", hondaPrice.high > hondaPrice.suggested && hondaPrice.suggested > hondaPrice.low);
assert("cleanTrade < suggested", hondaPrice.cleanTrade < hondaPrice.suggested);
assert("ratio > 0 and < 2", hondaPrice.ratio > 0 && hondaPrice.ratio < 2);
assert("frontEnd ≥ 0", hondaPrice.frontEnd >= 0);

const highMileage = estimatePrice({ year: 2015, make: "Ford", model: "Focus", mileage: 150000, condition: "Rough", price: 0 });
assert("high mileage rough car still ≥ $4000 floor", highMileage.suggested >= 4000);

console.log("\n── filterFlowRows ──");
const rows = [
  { notional: 50000, tradeType: "SWEEP", unusual: true },
  { notional: 10000, tradeType: "BLOCK", unusual: false },
  { notional: 200000, tradeType: "SWEEP", unusual: false },
];
assertEq("no filters → all rows", filterFlowRows(rows, {}).length, 3);
assertEq("minNotional=50000 → 2 rows", filterFlowRows(rows, { minNotional: 50000 }).length, 2);
assertEq("unusualOnly → 1 row", filterFlowRows(rows, { unusualOnly: true }).length, 1);
assertEq("flowType=sweep → 2 rows", filterFlowRows(rows, { flowType: "sweep" }).length, 2);
assertEq("empty input → empty", filterFlowRows([], {}).length, 0);

// ─── Inline indicator functions ───────────────────────────────────────────────

function computeEMA(values, period) {
  if (!values.length) return 0;
  const smoothing = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * smoothing + ema * (1 - smoothing);
  }
  return ema;
}

function computeRSI(values, period) {
  if (values.length <= period) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gains += delta; else losses += Math.abs(delta);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period || 0.0001;
  for (let i = period + 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    avgGain = ((avgGain * (period - 1)) + Math.max(delta, 0)) / period;
    avgLoss = ((avgLoss * (period - 1)) + Math.max(-delta, 0)) / period;
  }
  const rs = avgGain / (avgLoss || 0.0001);
  return 100 - (100 / (1 + rs));
}

function computeVWAP(bars) {
  let totalPV = 0, totalV = 0;
  for (const bar of bars) {
    const typical = (bar.high + bar.low + bar.close) / 3;
    const vol = bar.volume || 0;
    totalPV += typical * vol;
    totalV += vol;
  }
  return totalV ? totalPV / totalV : bars.at(-1)?.close || 0;
}

function detectTrend(price, ema21, ema200, closes) {
  const recent = closes.slice(-10);
  const first = recent[0] || price;
  const slope = ((price - first) / first) * 100;
  if (price > ema21 && ema21 > ema200 && slope > 1) return "Uptrend";
  if (price < ema21 && ema21 < ema200 && slope < -1) return "Downtrend";
  return "Range";
}

function scoreHeadline(headline) {
  const text = headline.toLowerCase();
  const bullishWords = ["beat", "surge", "upgrade", "growth", "record", "bull", "rally", "wins", "strong", "expands"];
  const bearishWords = ["miss", "drop", "downgrade", "cuts", "probe", "lawsuit", "bear", "weak", "fall", "slump"];
  let score = 0;
  bullishWords.forEach(w => { if (text.includes(w)) score += 1; });
  bearishWords.forEach(w => { if (text.includes(w)) score -= 1; });
  return score;
}

function classifyNewsSentiment(newsItems) {
  if (!newsItems.length) return "Neutral";
  const score = newsItems.slice(0, 5).reduce((total, item) => total + scoreHeadline(item.title), 0);
  if (score >= 2) return "Bullish";
  if (score <= -2) return "Bearish";
  return "Neutral";
}

function normalizeYield(value) {
  if (!value) return 0;
  const v = value > 20 ? value / 10 : value;
  return Math.round(v * 100) / 100;
}

// ─── Indicator tests ──────────────────────────────────────────────────────────

console.log("\n── computeEMA ──");
assertEq("single value → itself", computeEMA([100], 9), 100);
assert("rising values → EMA < last price", computeEMA([10, 20, 30, 40, 50], 3) < 50);
assert("EMA of flat series ≈ constant", Math.abs(computeEMA([100, 100, 100, 100], 3) - 100) < 0.01);
assert("empty → 0", computeEMA([], 9) === 0);

console.log("\n── computeRSI ──");
const trendingUp = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
const trendingDown = [25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10];
assert("strong uptrend RSI > 70", computeRSI(trendingUp, 14) > 70);
assert("strong downtrend RSI < 30", computeRSI(trendingDown, 14) < 30);
assertEq("too few values → 50", computeRSI([100, 101], 14), 50);

console.log("\n── computeVWAP ──");
const bars4 = [
  { high: 105, low: 95, close: 100, volume: 1000 },
  { high: 110, low: 100, close: 105, volume: 2000 },
];
assert("VWAP is a valid number", Number.isFinite(computeVWAP(bars4)));
assert("VWAP is between min low and max high", computeVWAP(bars4) >= 95 && computeVWAP(bars4) <= 110);

console.log("\n── detectTrend ──");
assertEq("bullish alignment → Uptrend", detectTrend(200, 190, 170, [195, 196, 197, 198, 199, 200, 200, 200, 200, 200]), "Uptrend");
assertEq("bearish alignment → Downtrend", detectTrend(150, 160, 180, [160, 159, 158, 157, 156, 155, 154, 153, 152, 150]), "Downtrend");
assertEq("mixed → Range", detectTrend(100, 105, 90, [100, 100, 100, 100, 100, 100, 100, 100, 100, 100]), "Range");

console.log("\n── classifyNewsSentiment ──");
assertEq("empty news → Neutral", classifyNewsSentiment([]), "Neutral");
assertEq("bullish headlines → Bullish",
  classifyNewsSentiment([{ title: "NVDA beat earnings and rally surged to record high" }, { title: "Strong growth upgrade from analyst" }]),
  "Bullish"
);
assertEq("bearish headlines → Bearish",
  classifyNewsSentiment([{ title: "Company misses earnings, stock drops on weak guidance" }, { title: "Analyst downgrade slump continues" }]),
  "Bearish"
);
assertEq("neutral mix → Neutral",
  classifyNewsSentiment([{ title: "Company announces quarterly results" }, { title: "Market watch overview" }]),
  "Neutral"
);

console.log("\n── normalizeYield ──");
assertEq("normal yield passthrough", normalizeYield(4.52), 4.52);
assertEq("null → 0", normalizeYield(null), 0);
assertEq("large raw value (e.g. 452 bps) → divides by 10", normalizeYield(45.2), 4.52);

// ─── TradingView webhook helpers ──────────────────────────────────────────────

function inferTradingViewSide(rawSide, message) {
  const side = String(rawSide || "").toUpperCase();
  if (["BUY", "LONG", "CALL"].includes(side)) return "BUY";
  if (["SELL", "SHORT", "PUT"].includes(side)) return "SELL";
  const msg = String(message || "").toLowerCase();
  if (msg.includes("buy") || msg.includes("long") || msg.includes("bull")) return "BUY";
  if (msg.includes("sell") || msg.includes("short") || msg.includes("bear")) return "SELL";
  return "INFO";
}

function scoreTradingViewPayload(text) {
  const msg = String(text || "").toLowerCase();
  let score = 72;
  if (msg.includes("breakout")) score += 10;
  if (msg.includes("reclaim")) score += 8;
  if (msg.includes("sweep")) score += 8;
  if (msg.includes("unusual")) score += 8;
  if (msg.includes("bearish") || msg.includes("breakdown")) score += 6;
  if (msg.includes("risk") || msg.includes("invalid")) score += 6;
  return Math.max(55, Math.min(99, score));
}

function parseTradingViewPayload(bodyText) {
  const raw = String(bodyText || "").trim();
  if (!raw) return null;
  let data = null;
  try { data = JSON.parse(raw); } catch { data = { message: raw }; }
  if (!data || typeof data !== "object") return null;
  const message = String(data.message || data.text || data.alert_message || data.alertName || data.note || "").trim();
  const explicitSymbol = String(data.symbol || data.ticker || data.instrument || data.s || "").trim().toUpperCase();
  const tvSymbolMatch = message.match(/(?:NASDAQ|NYSE|AMEX|CBOE|BINANCE|COINBASE):([A-Z0-9.\-]+)/i);
  const rawSymbolMatch = message.match(/\b([A-Z]{1,6}(?:\-[A-Z]{2,5})?)\b/);
  const symbol = explicitSymbol
    || (tvSymbolMatch ? String(tvSymbolMatch[1] || "").toUpperCase() : "")
    || (rawSymbolMatch ? String(rawSymbolMatch[1] || "").toUpperCase() : "");
  if (!symbol) return null;
  const side = inferTradingViewSide(data.side || data.action || data.signal, message);
  const priceNum = Number(data.price || data.close || data.last || 0);
  const timeframe = String(data.timeframe || data.tf || "").toUpperCase();
  const exchange = String(data.exchange || data.market || "").toUpperCase();
  const score = scoreTradingViewPayload(message);
  const type = side === "SELL" ? "risk" : "opportunity";
  return {
    id: `tv-test`,
    source: "tradingview",
    symbol, side, type, score,
    message: message || `${symbol} TradingView alert`,
    exchange: exchange || null,
    timeframe: timeframe || null,
    price: Number.isFinite(priceNum) && priceNum > 0 ? Number(priceNum.toFixed(4)) : null,
    at: new Date().toISOString(),
    raw: data
  };
}

console.log("\n── inferTradingViewSide ──");
assertEq("BUY explicit", inferTradingViewSide("BUY", ""), "BUY");
assertEq("LONG → BUY", inferTradingViewSide("LONG", ""), "BUY");
assertEq("SHORT → SELL", inferTradingViewSide("SHORT", ""), "SELL");
assertEq("PUT → SELL", inferTradingViewSide("PUT", ""), "SELL");
assertEq("bull in message → BUY", inferTradingViewSide("", "bullish breakout"), "BUY");
assertEq("bear in message → SELL", inferTradingViewSide("", "bearish breakdown"), "SELL");
assertEq("ambiguous → INFO", inferTradingViewSide("", "price at key level"), "INFO");

console.log("\n── scoreTradingViewPayload ──");
assert("base score in valid range", scoreTradingViewPayload("") >= 55 && scoreTradingViewPayload("") <= 99);
assert("breakout bumps score up", scoreTradingViewPayload("breakout above range") > scoreTradingViewPayload("price at level"));
assert("score capped at 99", scoreTradingViewPayload("breakout reclaim sweep unusual bearish breakdown risk invalid") <= 99);

console.log("\n── parseTradingViewPayload ──");
const tvJson = parseTradingViewPayload(JSON.stringify({ symbol: "NVDA", side: "BUY", price: 974.5, message: "Breakout above range", timeframe: "1D" }));
assert("parses JSON payload", tvJson !== null);
assertEq("extracts symbol", tvJson?.symbol, "NVDA");
assertEq("extracts side", tvJson?.side, "BUY");
assertEq("extracts price", tvJson?.price, 974.5);
assertEq("type is opportunity for BUY", tvJson?.type, "opportunity");

const tvText = parseTradingViewPayload("NVDA BUY alert — breakout above range");
assert("parses plain text payload", tvText !== null);
assertEq("plain text side", tvText?.side, "BUY");

assertEq("empty string → null", parseTradingViewPayload(""), null);
assertEq("no symbol → null", parseTradingViewPayload(JSON.stringify({ message: "generic alert" })), null);

// ─── Journal sanitization ────────────────────────────────────────────────────

function sanitizeJournalEntry(raw) {
  const ticker = String(raw.ticker || "").toUpperCase().replace(/[^A-Z0-9.^-]/g, "").slice(0, 12);
  const side = ["BUY", "SELL", "HOLD", "WATCH"].includes(String(raw.side || "").toUpperCase())
    ? String(raw.side).toUpperCase() : "WATCH";
  const score = Math.max(0, Math.min(100, Math.round(Number(raw.score) || 0)));
  const entry = Math.max(0, Number(raw.entry) || 0);
  const stopLoss = Math.max(0, Number(raw.stopLoss) || 0);
  const target = Math.max(0, Number(raw.target) || 0);
  return { ticker, side, score, entry, stopLoss, target };
}

function calcPnl(direction, entry, closePrice, size) {
  const mult = direction === "SELL" ? -1 : 1;
  return mult * (closePrice - entry) * size;
}

console.log("\n── journal sanitizeEntry ──");
const je = sanitizeJournalEntry({ ticker: "nvda!", side: "buy", score: 88.9, entry: "450.5", stopLoss: "440", target: "470" });
assertEq("ticker uppercased", je.ticker, "NVDA");
assertEq("side uppercased", je.side, "BUY");
assertEq("score rounded", je.score, 89);
assertEq("entry numeric", je.entry, 450.5);

const jeBad = sanitizeJournalEntry({ ticker: "", side: "INVALID", score: 999, entry: -5 });
assertEq("empty ticker stays empty", jeBad.ticker, "");
assertEq("invalid side → WATCH", jeBad.side, "WATCH");
assertEq("score capped at 100", jeBad.score, 100);
assertEq("negative entry clamped to 0", jeBad.entry, 0);

console.log("\n── journal P&L calc ──");
assertEq("long profit", calcPnl("BUY", 100, 110, 10), 100);
assertEq("long loss", calcPnl("BUY", 100, 90, 10), -100);
assertEq("short profit", calcPnl("SELL", 100, 90, 10), 100);
assertEq("short loss", calcPnl("SELL", 100, 110, 10), -100);

// ─── Portfolio sanitization ───────────────────────────────────────────────────

function sanitizeHolding(raw) {
  const symbol = String(raw.symbol || "").toUpperCase().replace(/[^A-Z0-9.^-]/g, "").slice(0, 12);
  const shares = Math.max(0, Number(raw.shares) || 0);
  const costBasis = Math.max(0, Number(raw.costBasis || raw.avgCost) || 0);
  if (!symbol || shares <= 0 || costBasis <= 0) return null;
  return { symbol, shares, costBasis };
}

console.log("\n── portfolio sanitizeHolding ──");
const h = sanitizeHolding({ symbol: "aapl", shares: "10", costBasis: "175.5" });
assertEq("symbol uppercased", h?.symbol, "AAPL");
assertEq("shares numeric", h?.shares, 10);
assertEq("costBasis numeric", h?.costBasis, 175.5);

assertEq("zero shares → null", sanitizeHolding({ symbol: "AAPL", shares: 0, costBasis: 100 }), null);
assertEq("no symbol → null", sanitizeHolding({ symbol: "", shares: 10, costBasis: 100 }), null);
assertEq("accepts avgCost alias", sanitizeHolding({ symbol: "MSFT", shares: 5, avgCost: 300 })?.costBasis, 300);

// ─── Dealer market comps estimator ───────────────────────────────────────────

function estimateMarketValue(year, make, model, mileage, condition) {
  const currentYear = new Date().getFullYear();
  const age = Math.max(currentYear - Number(year || currentYear), 0);
  const mi = Number(mileage || 0);
  const mkLower = String(make || "").toLowerCase();
  const mdLower = String(model || "").toLowerCase();

  let base = 31000 - age * 2100;
  if (["toyota", "honda", "lexus", "acura"].includes(mkLower)) base *= 1.08;
  if (["chevrolet", "ford", "gmc"].includes(mkLower)) base *= 1.03;
  if (["bmw", "mercedes", "mercedes-benz", "audi", "porsche"].includes(mkLower)) base *= 1.15;
  if (mdLower.includes("tahoe") || mdLower.includes("truck") || mdLower.includes("f-150") || mdLower.includes("silverado")) base *= 1.1;
  base -= Math.max(mi - 60000, 0) * 0.05;
  base *= ({ Excellent: 1.08, "Very Good": 1.04, Good: 1, Fair: 0.92, Rough: 0.84 }[condition] || 1);
  return Math.max(Math.round(base / 100) * 100, 4000);
}

console.log("\n── dealer estimateMarketValue ──");
const toyotaVal = estimateMarketValue(2020, "Toyota", "Camry", 60000, "Good");
assert("toyota gets brand premium", toyotaVal > estimateMarketValue(2020, "Generic", "Sedan", 60000, "Good"));

const luxVal = estimateMarketValue(2020, "BMW", "3 Series", 60000, "Good");
assert("bmw gets luxury premium", luxVal > toyotaVal);

const roughVal = estimateMarketValue(2020, "Toyota", "Camry", 60000, "Rough");
const excelVal = estimateMarketValue(2020, "Toyota", "Camry", 60000, "Excellent");
assert("excellent > rough condition", excelVal > roughVal);

const hiMiVal = estimateMarketValue(2020, "Toyota", "Camry", 150000, "Good");
assert("high mileage reduces value", hiMiVal < toyotaVal);

assert("floor is $4000", estimateMarketValue(1960, "Generic", "Clunker", 500000, "Rough") >= 4000);

// ─── dealGrade ────────────────────────────────────────────────────────────────

function dealGrade(score) {
  if (score >= 72) return { grade: "A" };
  if (score >= 55) return { grade: "B" };
  if (score >= 38) return { grade: "C" };
  return { grade: "D" };
}

console.log("\n── dealGrade ──");
assertEq("score 72 → A", dealGrade(72).grade, "A");
assertEq("score 71 → B", dealGrade(71).grade, "B");
assertEq("score 55 → B", dealGrade(55).grade, "B");
assertEq("score 54 → C", dealGrade(54).grade, "C");
assertEq("score 38 → C", dealGrade(38).grade, "C");
assertEq("score 37 → D", dealGrade(37).grade, "D");
assertEq("score 0 → D", dealGrade(0).grade, "D");
assertEq("score 100 → A", dealGrade(100).grade, "A");

// ─── scoreDeal ────────────────────────────────────────────────────────────────

function scoreDeal(vehicle, pricing) {
  let score = 0;
  const mileage = Number(vehicle.mileage || 0);
  const make = String(vehicle.make || "").toLowerCase();
  score += Math.min(pricing.frontEnd / 150, 40);
  score += Math.min((pricing.high - pricing.cleanTrade) / 200, 25);
  score += mileage <= 80000 ? 15 : mileage <= 120000 ? 10 : 5;
  if (["toyota", "honda", "lexus", "acura"].includes(make)) score += 10;
  if (["chevrolet", "ford", "gmc"].includes(make)) score += 7;
  if (pricing.ratio <= 0.82) score += 12;
  else if (pricing.ratio <= 0.9) score += 8;
  else if (pricing.ratio <= 1) score += 4;
  return Math.round(score);
}

console.log("\n── scoreDeal ──");
const goodDeal = scoreDeal(
  { mileage: 60000, make: "Toyota" },
  { frontEnd: 5000, high: 22000, cleanTrade: 15000, ratio: 0.80 }
);
const badDeal = scoreDeal(
  { mileage: 180000, make: "Unknown" },
  { frontEnd: 0, high: 10000, cleanTrade: 9500, ratio: 1.1 }
);
assert("good deal scores higher than bad deal", goodDeal > badDeal);
assert("score is a non-negative integer", goodDeal >= 0 && Number.isInteger(goodDeal));
assert("Toyota gets brand bonus", scoreDeal({ mileage: 60000, make: "Toyota" }, { frontEnd: 2000, high: 18000, cleanTrade: 14000, ratio: 0.88 })
  > scoreDeal({ mileage: 60000, make: "Unknown" }, { frontEnd: 2000, high: 18000, cleanTrade: 14000, ratio: 0.88 }));
assert("low mileage scores better than high mileage (same car)", scoreDeal({ mileage: 40000, make: "Honda" }, { frontEnd: 3000, high: 20000, cleanTrade: 15000, ratio: 0.85 })
  > scoreDeal({ mileage: 150000, make: "Honda" }, { frontEnd: 3000, high: 20000, cleanTrade: 15000, ratio: 0.85 }));

// ─── journal stats math ───────────────────────────────────────────────────────

function calcJournalStats(entries) {
  const closed = entries.filter(e => e.status === "closed" && e.pnl != null);
  const wins = closed.filter(e => e.pnl > 0);
  const losses = closed.filter(e => e.pnl <= 0);
  const totalPnl = closed.reduce((s, e) => s + e.pnl, 0);
  const avgPnl = closed.length ? totalPnl / closed.length : 0;
  const winRate = closed.length ? Math.round((wins.length / closed.length) * 100) : null;
  const bestTrade = closed.length ? closed.reduce((b, e) => e.pnl > b.pnl ? e : b, closed[0]) : null;
  const worstTrade = closed.length ? closed.reduce((w, e) => e.pnl < w.pnl ? e : w, closed[0]) : null;
  return { total: entries.length, closed: closed.length, wins: wins.length, losses: losses.length,
           totalPnl, avgPnl, winRate, bestTrade, worstTrade };
}

console.log("\n── journal stats math ──");
const journalEntries = [
  { status: "open",   pnl: null,  ticker: "AAPL" },
  { status: "closed", pnl: 200,   ticker: "NVDA" },
  { status: "closed", pnl: -80,   ticker: "TSLA" },
  { status: "closed", pnl: 150,   ticker: "MSFT" },
  { status: "cancelled", pnl: null, ticker: "AMD" },
];
const stats = calcJournalStats(journalEntries);
assertEq("total count", stats.total, 5);
assertEq("closed count", stats.closed, 3);
assertEq("wins count", stats.wins, 2);
assertEq("losses count", stats.losses, 1);
assertEq("win rate 67%", stats.winRate, 67);
assertEq("total P&L", Math.round(stats.totalPnl * 100) / 100, 270);
assertEq("best trade ticker", stats.bestTrade?.ticker, "NVDA");
assertEq("worst trade ticker", stats.worstTrade?.ticker, "TSLA");

const noTrades = calcJournalStats([]);
assertEq("empty journal → total 0", noTrades.total, 0);
assertEq("empty journal → winRate null", noTrades.winRate, null);

// ─── market movers sort ───────────────────────────────────────────────────────

function pickMovers(quotes, n) {
  const valid = quotes.filter(q => typeof q.price === "number" && typeof q.changesPercentage === "number");
  const sorted = [...valid].sort((a, b) => b.changesPercentage - a.changesPercentage);
  const gainers = sorted.slice(0, n).map(q => ({ symbol: q.symbol, changesPercentage: q.changesPercentage }));
  const losers = sorted.slice(-n).reverse().map(q => ({ symbol: q.symbol, changesPercentage: q.changesPercentage }));
  return { gainers, losers, count: valid.length };
}

console.log("\n── market movers sort ──");
const quotes = [
  { symbol: "NVDA", price: 900, changesPercentage: 8.5 },
  { symbol: "AAPL", price: 190, changesPercentage: -3.2 },
  { symbol: "MSFT", price: 400, changesPercentage: 1.1 },
  { symbol: "META", price: 500, changesPercentage: -7.8 },
  { symbol: "TSLA", price: 250, changesPercentage: 5.2 },
  { symbol: "AMZN", price: 180, changesPercentage: -0.4 },
];
const movers = pickMovers(quotes, 3);
assertEq("top gainer is NVDA", movers.gainers[0].symbol, "NVDA");
assertEq("second gainer is TSLA", movers.gainers[1].symbol, "TSLA");
assertEq("top loser is META", movers.losers[0].symbol, "META");
assertEq("second loser is AAPL", movers.losers[1].symbol, "AAPL");
assertEq("total valid count", movers.count, 6);

const noPrice = pickMovers([{ symbol: "X", changesPercentage: 5 }, { symbol: "Y", price: 100 }], 3);
assertEq("filters out missing price/change", noPrice.count, 0);

const singleQuote = pickMovers([{ symbol: "SPY", price: 500, changesPercentage: 0.3 }], 3);
assertEq("single quote → gainer and loser are both SPY", singleQuote.gainers[0]?.symbol, "SPY");

// ─── buildComps ───────────────────────────────────────────────────────────────

function buildComps(year, make, model, trim, mileage, condition, marketValue) {
  const mi = Number(mileage || 0);
  const variations = [
    { priceMult: 1.05, miOffset: -8000,  condOffset: 0,  dom: 21 },
    { priceMult: 1.02, miOffset: 5000,   condOffset: 0,  dom: 27 },
    { priceMult: 0.98, miOffset: 12000,  condOffset: 1,  dom: 33 },
    { priceMult: 0.95, miOffset: 20000,  condOffset: 1,  dom: 42 },
    { priceMult: 1.00, miOffset: -2000,  condOffset: 0,  dom: 30 },
  ];
  const conditions = ["Excellent", "Very Good", "Good", "Fair", "Rough"];
  const condIdx = conditions.indexOf(condition);
  const sources = ["Private Party", "Dealer Listing", "CarGurus Est.", "Private Party", "Dealer Listing"];

  return variations.map((v, i) => {
    const compMi = Math.max(mi + v.miOffset, 0);
    const compCondIdx = Math.min(Math.max(condIdx + v.condOffset, 0), conditions.length - 1);
    const compCond = conditions[compCondIdx];
    const price = Math.max(Math.round(marketValue * v.priceMult / 100) * 100, 3000);
    return { year: Number(year), make, model, trim: trim || "", mileage: compMi, condition: compCond, price, daysOnMarket: v.dom, source: sources[i] };
  });
}

console.log("\n── buildComps ──");
const camryVal = estimateMarketValue(2020, "Toyota", "Camry", 60000, "Good");
const comps = buildComps(2020, "Toyota", "Camry", "SE", 60000, "Good", camryVal);
assertEq("returns 5 comps", comps.length, 5);
assert("first comp is pricier (lower mileage)", comps[0].price > comps[3].price);
assert("all comp prices ≥ $3000", comps.every(c => c.price >= 3000));
assert("all comps have daysOnMarket > 0", comps.every(c => c.daysOnMarket > 0));
assert("mileage offset applied (first comp has lower mileage)", comps[0].mileage < 60000 || comps[0].mileage === 0);
assertEq("first comp make preserved", comps[0].make, "Toyota");

const roughComps = buildComps(2018, "Ford", "F-150", "XLT", 100000, "Rough", 18000);
assert("rough condition comp steps down", roughComps[2].condition === "Rough" || roughComps[2].condition === "Fair");
assert("zero mileage floor — negative mileage clamped to 0", roughComps.every(c => c.mileage >= 0));

// ─── TV webhook → journal side mapping ────────────────────────────────────────

function webhookSideToJournalSide(rawSide) {
  const side = String(rawSide || "INFO").toUpperCase();
  if (side === "BUY") return "BUY";
  if (side === "SELL") return "SELL";
  return "WAIT";
}

console.log("\n── webhook side → journal side ──");
assertEq("BUY → BUY", webhookSideToJournalSide("BUY"), "BUY");
assertEq("SELL → SELL", webhookSideToJournalSide("SELL"), "SELL");
assertEq("INFO → WAIT", webhookSideToJournalSide("INFO"), "WAIT");
assertEq("undefined → WAIT", webhookSideToJournalSide(undefined), "WAIT");
assertEq("empty → WAIT", webhookSideToJournalSide(""), "WAIT");
assertEq("LONG (from TV) not mapped — stays WAIT", webhookSideToJournalSide("LONG"), "WAIT");

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
