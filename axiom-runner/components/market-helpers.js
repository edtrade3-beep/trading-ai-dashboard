// Small shared market-domain calculations and reference data used by
// multiple components (both still in the axiom-live.jsx monolith and
// split-out files) — kept separate from ui-helpers.js, which is purely
// about styling.

export const SECTOR_ETFS = [
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

export const STOCK_TO_SECTOR = {
  NVDA: "XLK", AAPL: "XLK", MSFT: "XLK", AVGO: "XLK",
  AMZN: "XLY", TSLA: "XLY", HD: "XLY",
  META: "XLC", GOOGL: "XLC", CRM: "XLK",
  JPM: "XLF", XOM: "XLE", UNH: "XLV", LLY: "XLV", V: "XLF",
};

// Market regime score — 0-100 across SPY/QQQ/VIX (avoids trading weak tape).
// Pass the macro quotes array; returns { score, label, color, factors }.
export function computeRegime(macroData) {
  const find = s => (macroData || []).find(m => (m.symbol || "").toUpperCase() === s);
  const spy = find("SPY"), qqq = find("QQQ"), vix = find("VIX") || find("^VIX") || find("VIXY");
  const chg = q => Number(q?.changesPercentage || 0);
  const factors = [];
  // SPY / QQQ trending up today (proxy for above 21-EMA when we lack the EMA client-side)
  factors.push({ label: "SPY up", pass: spy ? chg(spy) > -0.1 : false, pts: 20 });
  factors.push({ label: "QQQ up", pass: qqq ? chg(qqq) > -0.1 : false, pts: 20 });
  // VIX calm
  const vixVal = Number(vix?.price || vix?.regularMarketPrice || 0);
  factors.push({ label: "VIX < 20", pass: vixVal > 0 ? vixVal < 20 : (spy ? chg(spy) > -0.3 : false), pts: 20 });
  // Breadth proxy: both SPY and QQQ green = broad participation
  factors.push({ label: "Breadth +", pass: spy && qqq ? (chg(spy) > 0 && chg(qqq) > 0) : false, pts: 20 });
  // Trend day proxy: SPY moving decisively (|chg| > 0.4%) in the up direction
  factors.push({ label: "Trend day", pass: spy ? chg(spy) > 0.4 : false, pts: 20 });
  const score = factors.reduce((s, f) => s + (f.pass ? f.pts : 0), 0);
  const label = score >= 75 ? "GREEN" : score >= 55 ? "YELLOW" : "RED";
  const color = score >= 75 ? "#22c55e" : score >= 55 ? "#d6a312" : "#ef4444";
  return { score, label, color, factors, vixVal };
}

// A+ Score — one 0-100 number for "how good is this setup right now", combining trend-template
// quality (40pt), relative strength (30pt), current market regime (20pt), and buy-point proximity
// (10pt). A score with no explanation isn't actionable, so this always returns `reasons`.
// Row shape: { passCount (0-8), rsRating (0-100), verdict, atBuyPoint, volConfirmed, actionable }.
export function computeAPlusScore(row, regime) {
  const passCount = Number(row?.passCount || 0);
  const rsRating = Number(row?.rsRating || 0);
  const regimeScore = Number(regime?.score ?? 0);
  const trendPts = Math.round((passCount / 8) * 40);
  const rsPts = Math.round((rsRating / 100) * 30);
  const regimePts = Math.round((regimeScore / 100) * 20);
  const isGo = row?.verdict === "GO" || (row?.atBuyPoint && row?.volConfirmed);
  const setupPts = isGo ? 10 : row?.actionable ? 6 : 0;
  const score = Math.max(0, Math.min(100, trendPts + rsPts + regimePts + setupPts));
  const reasons = [
    `${passCount}/8 trend template criteria met`,
    rsRating >= 90 ? `RS ${rsRating} — top-decile market leader` : rsRating >= 70 ? `RS ${rsRating} — market leader` : `RS ${rsRating} — below leader threshold`,
    `Market regime ${regime?.label || "?"} (${regimeScore}/100)${regimeScore >= 75 ? " — favorable for breakouts" : regimeScore >= 55 ? " — mixed, be selective" : " — unfavorable, high failure risk"}`,
    isGo ? "At buy point with volume confirmation" : row?.actionable ? "Near pivot, not yet confirmed" : "Not yet actionable",
  ];
  return { score, reasons, breakdown: { trendPts, rsPts, regimePts, setupPts } };
}

// Fibonacci retracement/extension levels from real daily candle bars — the
// same pure calculation FibonacciTab's fetchFibonacci originally had
// inline, extracted here so it can also auto-run on every stock's
// technical analysis (MarketTerminalTab's Smart Scan panel, SmartScanTab's
// per-row deep-dive) without duplicating/diverging the math. Swing
// high/low over the trailing window (real candle data, no guessing);
// returns null if there isn't enough real data to compute from.
export const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618];
export const FIB_LABELS = ["0% (Low)", "23.6%", "38.2%", "50%", "61.8% (Golden)", "78.6%", "100% (High)", "127.2% (Ext)", "161.8% (Ext)"];
export function computeFibLevels(bars, ticker) {
  if (!Array.isArray(bars) || bars.length < 20) return null;
  const window = bars.slice(-90);
  const highs = window.map(b => b.high);
  const lows = window.map(b => b.low);
  const swingHigh = Math.max(...highs);
  const swingLow = Math.min(...lows);
  const range = swingHigh - swingLow;
  const last = window[window.length - 1].close;
  const levels = FIB_RATIOS.map((r, i) => ({
    label: FIB_LABELS[i], ratio: r,
    price: swingLow + range * r,
    isKey: [0.382, 0.5, 0.618].includes(r),
    isExt: r > 1,
  }));
  return { ticker, swingHigh, swingLow, levels, lastPrice: last };
}

// Next Action — a plain one-word verdict for new-money decisions (not position
// management — no REDUCE/REMOVE, this doesn't know what you already own).
// Same row shape as computeAPlusScore. Always returns a `reason`.
export function computeNextAction(row) {
  const stage = String(row?.stage || "");
  const isGo = row?.verdict === "GO" || (row?.atBuyPoint && row?.volConfirmed);
  if (isGo) return { action: "BUY", color: "#0d9465", reason: "At buy point with volume confirmation." };
  if (stage.includes("4")) return { action: "AVOID", color: "#c8282a", reason: "Stage 4 downtrend — do not buy." };
  if (row?.atBuyPoint) return { action: "BREAKOUT", color: "#2563eb", reason: "At the pivot, but volume hasn't confirmed yet — wait for it or size down." };
  if (row?.actionable) return { action: "WATCH", color: "#d6a312", reason: "Near the buy zone, building strength — not a trigger yet." };
  return { action: "WAIT", color: "#94a3b8", reason: "Not yet actionable — no clean entry right now." };
}
