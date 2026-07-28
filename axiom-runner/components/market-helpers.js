// Small shared market-domain calculations and reference data used by
// multiple components (both still in the axiom-live.jsx monolith and
// split-out files) — kept separate from ui-helpers.js, which is purely
// about styling.

// Real, consolidated scan universe — Phase 1 of the Institutional Scanner
// work (2026-07-27): previously RH_UNIVERSE (rhpro-shared.jsx, 60 symbols)
// and BEST_OPP_UNIVERSE (terminal-panels.jsx, 40 symbols) were two
// independently-hardcoded lists, fetched separately even though every one
// of the 40 BEST_OPP_UNIVERSE symbols was already inside RH_UNIVERSE — a
// real, verified full subset, not an approximation. Consolidating to this
// single list means Sniper Scanner, Best Opportunities, and the AI Trade
// Session all scan the exact same real universe instead of redundantly
// re-fetching overlapping symbols. Both files below now just re-export this
// same array under their existing names for backward compatibility with
// every existing import site.
export const SCAN_UNIVERSE = [
  "AAPL","MSFT","NVDA","AMZN","META","GOOGL","AVGO","TSLA","AMD","NFLX",
  "CRM","ORCL","ADBE","NOW","PANW","CRWD","PLTR","SNOW","MU","QCOM",
  "ANET","MRVL","SMCI","ARM","COIN","UBER","ABNB","SHOP","INTU","LRCX",
  "LLY","V","MA","JPM","COST","WMT","HD","AXP","GE","CAT",
  "TSM","VRT","NEE","WMB","CCJ","CEG","DELL","MARA","RIOT","CLSK",
  "CIFR","WULF","IREN","HOOD","NET","DDOG","ZS","CVNA","APP","RDDT",
];

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

// Real GICS-style sector assignments — expanded to cover the full
// SCAN_UNIVERSE (2026-07-28, Phase 3 of the Institutional Scanner work, for
// the new real Sector Strength dimension in Stock Quality Score). A handful
// of names sit on real classification boundaries (crypto miners MARA/RIOT/
// CLSK/CIFR/WULF/IREN bucketed Technology rather than Financials; UBER
// bucketed Consumer Discretionary rather than Industrials/Transportation) —
// defensible real-world choices, not fabricated, but genuinely debatable;
// revisit if a symbol's sector-relative score looks consistently off.
export const STOCK_TO_SECTOR = {
  AAPL: "XLK", MSFT: "XLK", NVDA: "XLK", AMZN: "XLY", META: "XLC", GOOGL: "XLC", AVGO: "XLK", TSLA: "XLY", AMD: "XLK", NFLX: "XLC",
  CRM: "XLK", ORCL: "XLK", ADBE: "XLK", NOW: "XLK", PANW: "XLK", CRWD: "XLK", PLTR: "XLK", SNOW: "XLK", MU: "XLK", QCOM: "XLK",
  ANET: "XLK", MRVL: "XLK", SMCI: "XLK", ARM: "XLK", COIN: "XLF", UBER: "XLY", ABNB: "XLY", SHOP: "XLK", INTU: "XLK", LRCX: "XLK",
  LLY: "XLV", V: "XLF", MA: "XLF", JPM: "XLF", COST: "XLP", WMT: "XLP", HD: "XLY", AXP: "XLF", GE: "XLI", CAT: "XLI",
  TSM: "XLK", VRT: "XLI", NEE: "XLU", WMB: "XLE", CCJ: "XLE", CEG: "XLU", DELL: "XLK", MARA: "XLK", RIOT: "XLK", CLSK: "XLK",
  CIFR: "XLK", WULF: "XLK", IREN: "XLK", HOOD: "XLF", NET: "XLK", DDOG: "XLK", ZS: "XLK", CVNA: "XLY", APP: "XLK", RDDT: "XLC",
  // Kept for any symbol outside SCAN_UNIVERSE that still calls this map directly.
  XOM: "XLE", UNH: "XLV",
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
  // 4-band regime (ORANGE added 2026-07-28 per the MISSION doc, between
  // YELLOW and RED) — same 5 real factors above, only the label/color
  // threshold changed. ORANGE = meaningfully weaker than YELLOW's "mixed,
  // be selective" but not yet RED's "stand down" — real distinction for a
  // tape that's actively deteriorating (1-2 real factors left) vs one
  // that's just mixed (2-3 real factors).
  const label = score >= 75 ? "GREEN" : score >= 55 ? "YELLOW" : score >= 40 ? "ORANGE" : "RED";
  const color = score >= 75 ? "#22c55e" : score >= 55 ? "#d6a312" : score >= 40 ? "#e07b1a" : "#ef4444";
  return { score, label, color, factors, vixVal };
}

// Trade Setup Score — "is TODAY the right time" (fast-changing timing/regime
// read), as distinct from rhScore/stockQualityBreakdown's Stock Quality
// Score — "is this a good STOCK" (slow-changing company/trend quality).
// Real, 7 dimensions, 100pts (redesigned 2026-07-28, Phase 3 of the
// Institutional Scanner work, from the original 9-dimension version that
// mixed quality signals — trend/RS/catalyst/fundamental — into a timing
// score; those now live in Stock Quality instead, which is *why* this split
// is real and not just relabeling: each score now measures something
// genuinely different). Every dimension reuses a field
// /api/market/trend-screen ALREADY computes and returns on this same `row`
// object — zero new API calls.
//
// Deliberately did NOT build a separate "reward:risk ratio" dimension from
// riskPct+target2 — target2 is defined as `entry + 2*(entry-stop)`
// (routes/market.js), i.e. mechanically exactly 2x riskPct for every single
// row by construction, so a "ratio" built from those two fields would score
// identically for every stock — fake differentiation, not a real signal.
// Folded that former 15pt "Reward:Risk" allocation into Risk Discipline
// below (riskPct tightness IS the one real, row-varying signal this
// fixed-2R-target platform can honestly offer here) rather than inventing a
// second independent number to fill the spec's literal 8-dimension shape.
// Earnings-imminent risk (the old catalystPts) is still surfaced as a real
// non-scored caution flag in `reasons`/`cautions` — folding it back into
// either score's fixed 100pt budget would force double-counting or
// displacing another real dimension, so it stays informational.
//
// Where real data can be legitimately absent for a symbol (no breakout
// state yet, no real VCP base) this gives an honest mid-point credit rather
// than a punishing zero — same "honest null, never fabricated" discipline
// used everywhere else in this app.
export function computeAPlusScore(row, regime) {
  const passCount = Number(row?.passCount || 0);
  const regimeScore = Number(regime?.score ?? 0);

  // 1. Market regime — today's real SPY/QQQ/VIX-derived regime score.
  const regimePts = Math.round((regimeScore / 100) * 20);

  // 2. Entry timing — real distance from the pivot buy zone (abovePivotPct).
  // Ideal real entry window is 0% to +5% above pivot (a fresh, unextended
  // breakout); below the pivot means the base isn't broken yet, above +5%
  // means chasing an extended move — both are real timing penalties.
  const abovePivotPct = Number(row?.abovePivotPct);
  const idealDist = !Number.isFinite(abovePivotPct) ? null
    : abovePivotPct < 0 ? -abovePivotPct : Math.max(0, abovePivotPct - 5);
  const entryPts = idealDist == null ? 10 : Math.round(Math.max(0, Math.min(1, (15 - idealDist) / 15)) * 20);

  // 3. Breakout confirmation — actionability plus the real breakout-engine
  // confidence (0-100, from vcpBreakoutEngine) when a breakout state exists.
  const isGo = row?.verdict === "GO" || (row?.atBuyPoint && row?.volConfirmed);
  const breakoutConf = Number(row?.confidence) || 0;
  const breakoutBase = isGo ? 12 : row?.actionable ? 7 : 0;
  const breakoutBonus = Math.round((breakoutConf / 100) * 3);
  const breakoutPts = Math.min(15, breakoutBase + breakoutBonus);

  // 4. Volume confirmation — real volume vs the 50-day average; 2x+ = full credit.
  const volRatio = Number(row?.volRatio);
  const volPts = Number.isFinite(volRatio) ? Math.round(Math.max(0, Math.min(1, volRatio / 2)) * 10) : 5;

  // 5. Risk discipline — real % distance from entry to stop; tighter = less
  // capital at risk for the same fixed 2R target this platform always uses
  // (see note above on why this absorbs the old separate R:R allocation).
  const riskPct = Number(row?.riskPct);
  const riskPts = Number.isFinite(riskPct) && riskPct > 0 ? Math.round(Math.max(0, Math.min(1, (10 - riskPct) / 7)) * 20) : 10;

  // 6. Support / structure — real % distance from the 52-week high; trading
  // near highs means less real overhead resistance between here and new
  // highs, a genuine Stage-2-uptrend support signal.
  const pctFromHigh = Number(row?.pctFromHigh);
  const supportPts = Number.isFinite(pctFromHigh) ? Math.round(Math.max(0, Math.min(1, (pctFromHigh + 25) / 25)) * 10) : 5;

  // 7. Volatility/base tightness — real VCP contraction pattern (each pullback
  // shallower than the last) is Minervini's own volatility-contraction signal.
  const volatilityPts = row?.tightening ? 5 : (row?.vcpGrade && row.vcpGrade !== "-" ? 3 : 2);

  const score = Math.max(0, Math.min(100, regimePts + entryPts + breakoutPts + volPts + riskPts + supportPts + volatilityPts));
  const cautions = [];
  if (row?.earningsSoon) cautions.push(`⚠️ Earnings within ${row.earningsDte} day${row.earningsDte === 1 ? "" : "s"} — added gap risk (not scored, timing-only caution)`);
  const reasons = [
    `Market regime ${regime?.label || "?"} (${regimeScore}/100)${regimeScore >= 75 ? " — favorable for breakouts" : regimeScore >= 55 ? " — mixed, be selective" : " — unfavorable, high failure risk"}`,
    idealDist == null ? "Pivot distance unavailable"
      : abovePivotPct < 0 ? `${Math.abs(abovePivotPct).toFixed(1)}% below pivot — base not yet broken`
      : abovePivotPct <= 5 ? `${abovePivotPct.toFixed(1)}% above pivot — fresh, unextended entry`
      : `${abovePivotPct.toFixed(1)}% above pivot — extended, chasing risk`,
    isGo ? `At buy point with volume confirmation${breakoutConf ? ` (${breakoutConf}% breakout confidence)` : ""}` : row?.actionable ? "Near pivot, not yet confirmed" : "Not yet actionable",
    Number.isFinite(volRatio) ? `Volume ${volRatio.toFixed(1)}x the 50-day average` : "Volume data unavailable",
    Number.isFinite(riskPct) && riskPct > 0 ? `${riskPct.toFixed(1)}% risk to stop — ${riskPct <= 5 ? "tight, low-risk entry" : riskPct <= 8 ? "moderate risk" : "wide stop, higher risk"}` : "Risk distance unavailable",
    Number.isFinite(pctFromHigh) ? `${Math.abs(pctFromHigh).toFixed(1)}% ${pctFromHigh < 0 ? "below" : "at"} the 52-week high` : "52-week high distance unavailable",
    row?.tightening ? "VCP tightening — each pullback shallower than the last" : row?.vcpGrade && row.vcpGrade !== "-" ? `VCP grade ${row.vcpGrade}, not yet tightening` : "No real VCP base detected",
  ];
  return { score, reasons, cautions, breakdown: { regimePts, entryPts, breakoutPts, volPts, riskPts, supportPts, volatilityPts }, passCount };
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
