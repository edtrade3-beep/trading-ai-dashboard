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

// A+ Score — one 0-100 number for "how good is this setup right now," across 9 real
// dimensions (extended 2026-07-27 from an original 4 — trend/RS/regime/setup — per
// explicit user request, matching the "AI Market Intelligence Platform" spec's
// Technical/Momentum/Volume/Risk/Volatility/Catalyst/Fundamental breadth). Every new
// dimension reuses a field `/api/market/trend-screen` ALREADY computes and returns on
// this same `row` object — zero new API calls, zero paid infra, matching this app's
// free-tier-stack constraint and its repeated "grep before building — the data usually
// already exists" lesson. A score with no explanation isn't actionable, so this always
// returns `reasons` (now 9 lines, one per dimension).
//
// Row shape used: { passCount (0-8), rsRating (0-100), verdict, atBuyPoint, volConfirmed,
// actionable, confidence (real breakout-engine 0-100), volRatio, riskPct, tightening,
// vcpGrade, earningsSoon, earningsDte, epsGrowth }.
//
// Deliberately did NOT build a "reward:risk ratio" dimension from riskPct+target2 —
// target2 is defined as `entry + 2*(entry-stop)` (routes/market.js), i.e. mechanically
// exactly 2x riskPct for every single row by construction. A "ratio" dimension built from
// those two fields would score identically for every stock — fake differentiation, not a
// real signal. Used riskPct alone instead (tighter stop = genuinely less capital at risk
// for the same fixed 2R target), which does vary meaningfully row to row.
//
// Where real data can be legitimately absent for a symbol (thin-coverage tickers lacking
// forward EPS, no earnings date on file, no breakout state yet) this gives an honest
// mid-point credit rather than a punishing zero or a fabricated number — same "honest null,
// never fabricated" discipline used everywhere else in this app (X Intel sentiment, halal
// screening, etc.).
export function computeAPlusScore(row, regime) {
  const passCount = Number(row?.passCount || 0);
  const rsRating = Number(row?.rsRating || 0);
  const regimeScore = Number(regime?.score ?? 0);

  // 1. Trend structure — Minervini 8-point trend template pass count.
  const trendPts = Math.round((passCount / 8) * 20);
  // 2. Relative strength — percentile rank vs the screened universe.
  const rsPts = Math.round((rsRating / 100) * 15);
  // 3. Market regime/alignment — today's real SPY/QQQ/VIX-derived regime score.
  const regimePts = Math.round((regimeScore / 100) * 15);

  // 4. Setup/breakout quality — actionability plus the real breakout-engine
  // confidence (0-100, from vcpBreakoutEngine) when a breakout state exists.
  const isGo = row?.verdict === "GO" || (row?.atBuyPoint && row?.volConfirmed);
  const breakoutConf = Number(row?.confidence) || 0;
  const setupBase = isGo ? 12 : row?.actionable ? 7 : 0;
  const setupBonus = Math.round((breakoutConf / 100) * 3);
  const setupPts = Math.min(15, setupBase + setupBonus);

  // 5. Volume confirmation — real volume vs the 50-day average; 2x+ = full credit.
  const volRatio = Number(row?.volRatio);
  const volPts = Number.isFinite(volRatio) ? Math.round(Math.max(0, Math.min(1, volRatio / 2)) * 10) : 5;

  // 6. Risk tightness — real % distance from entry to stop; tighter = less capital
  // at risk for the same fixed 2R target this platform always uses (see note above).
  const riskPct = Number(row?.riskPct);
  const riskPts = Number.isFinite(riskPct) && riskPct > 0 ? Math.round(Math.max(0, Math.min(1, (10 - riskPct) / 7)) * 10) : 5;

  // 7. Volatility/base tightness — real VCP contraction pattern (each pullback
  // shallower than the last) is Minervini's own volatility-contraction signal.
  const volatilityPts = row?.tightening ? 5 : (row?.vcpGrade && row.vcpGrade !== "-" ? 3 : 2);

  // 8. Catalyst/earnings risk — real days-to-earnings; imminent earnings is
  // genuine added uncertainty (gap risk), not a bonus signal, so it REDUCES
  // points rather than adding them — matches the charter's "protect capital
  // first" ordering.
  const catalystPts = row?.earningsSoon ? 0 : (row?.earningsDte == null ? 3 : 5);

  // 9. Fundamental momentum — real forward-vs-trailing EPS growth % when Yahoo
  // has both figures (often absent for thin-coverage names/ETFs — honest
  // mid-point credit then, not a fabricated growth number).
  const epsGrowth = Number(row?.epsGrowth);
  const fundamentalPts = Number.isFinite(epsGrowth) ? Math.round(Math.max(0, Math.min(1, (epsGrowth + 10) / 30)) * 5) : 3;

  const score = Math.max(0, Math.min(100, trendPts + rsPts + regimePts + setupPts + volPts + riskPts + volatilityPts + catalystPts + fundamentalPts));
  const reasons = [
    `${passCount}/8 trend template criteria met`,
    rsRating >= 90 ? `RS ${rsRating} — top-decile market leader` : rsRating >= 70 ? `RS ${rsRating} — market leader` : `RS ${rsRating} — below leader threshold`,
    `Market regime ${regime?.label || "?"} (${regimeScore}/100)${regimeScore >= 75 ? " — favorable for breakouts" : regimeScore >= 55 ? " — mixed, be selective" : " — unfavorable, high failure risk"}`,
    isGo ? `At buy point with volume confirmation${breakoutConf ? ` (${breakoutConf}% breakout confidence)` : ""}` : row?.actionable ? "Near pivot, not yet confirmed" : "Not yet actionable",
    Number.isFinite(volRatio) ? `Volume ${volRatio.toFixed(1)}x the 50-day average` : "Volume data unavailable",
    Number.isFinite(riskPct) && riskPct > 0 ? `${riskPct.toFixed(1)}% risk to stop — ${riskPct <= 5 ? "tight, low-risk entry" : riskPct <= 8 ? "moderate risk" : "wide stop, higher risk"}` : "Risk distance unavailable",
    row?.tightening ? "VCP tightening — each pullback shallower than the last" : row?.vcpGrade && row.vcpGrade !== "-" ? `VCP grade ${row.vcpGrade}, not yet tightening` : "No real VCP base detected",
    row?.earningsSoon ? `⚠️ Earnings within ${row.earningsDte} day${row.earningsDte === 1 ? "" : "s"} — added gap risk` : row?.earningsDte == null ? "Earnings date unavailable" : `No earnings for ${row.earningsDte} days`,
    Number.isFinite(epsGrowth) ? `EPS growth (fwd vs TTM): ${epsGrowth >= 0 ? "+" : ""}${epsGrowth}%` : "Forward EPS data unavailable",
  ];
  return { score, reasons, breakdown: { trendPts, rsPts, regimePts, setupPts, volPts, riskPts, volatilityPts, catalystPts, fundamentalPts } };
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
