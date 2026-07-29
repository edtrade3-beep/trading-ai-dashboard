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
// Expanded 60 → 100 (2026-07-29, "i need more stocks in that list") — the
// added 40 are the real union with src/advisor-ai.js's own separate
// (previously out-of-sync) 85-symbol scan universe, which already covered
// real sectors this list was missing (industrials/defense, energy/nuclear,
// healthcare/biotech, more fintech, more momentum small-caps), plus 6 more
// widely-known liquid names — advisor-ai.js's SCAN_UNIVERSE now mirrors
// this exact same list so both stay harmonized instead of silently
// drifting apart again. The trend-screen route's per-request symbol cap
// was raised 90 → 120 (src/routes/market.js) so Best Opportunities' single
// batched request isn't silently truncated at this larger size.
export const SCAN_UNIVERSE = [
  // Mega-cap tech / AI infrastructure
  "AAPL","MSFT","NVDA","AMZN","META","GOOGL","AVGO","TSLA","AMD","NFLX",
  "CRM","ORCL","ADBE","NOW","PANW","CRWD","PLTR","SNOW","MU","QCOM",
  "ANET","MRVL","SMCI","ARM","LRCX","TSM","INTC","TXN","ON","KLAC",
  // Cybersecurity / cloud / software
  "NET","DDOG","ZS","APP","FTNT","S","TEAM","WDAY","INTU",
  // Fintech / financials
  "COIN","HOOD","V","MA","JPM","GS","MS","BLK","SCHW","SOFI","AXP",
  // Consumer / retail
  "COST","HD","NKE","SBUX","UBER","ABNB","SHOP","LULU","WMT","CVNA",
  // Industrials / defense
  "CAT","LMT","RTX","NOC","GE","BA","DE",
  // Energy / power / nuclear
  "XOM","CVX","OXY","VRT","NEE","CCJ","CEG","SMR","OKLO","WMB",
  // Healthcare / biotech
  "LLY","UNH","ISRG","REGN","VRTX",
  // Momentum / small-mid cap
  "DELL","MARA","RIOT","RKLB","ASTS","IONQ","SOUN","CLSK","CIFR","WULF","IREN","RDDT",
  // Blue-chip additions
  "PYPL","DIS","KO","PEP","MCD","IBM",
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

// Institutional Grade — a 3rd, additive score (explicit user request,
// 2026-07-29): "one combined institutional-style grade" blending real
// fundamentals + technicals + smart money + options flow + macro + sector
// into a single 0-100 read. Deliberately does NOT replace or fold into
// Stock Quality Score or Trade Setup Score — those keep measuring what
// they've always measured (company/trend quality, and today's entry
// timing); this is a separate, broader "does the full real picture line
// up" read, same "additive, not merged" convention already used for every
// other score on this platform. Every dimension reuses a real field
// already fetched elsewhere (trend-screen row, chart.technicals from
// Phase 2, fundamentals overlay, regime, sector rank, a real options-flow
// summary) — zero fabricated numbers; missing real data gets an honest
// mid-point credit, never a guess.
export function computeInstitutionalGrade(row, technicals, regime, sectorInfo, optionsFlow) {
  // 1. Trend Structure (20) — same real Minervini template pass count used elsewhere.
  const passCount = Number(row?.passCount);
  const trendPts = Number.isFinite(passCount) ? Math.round((passCount / 8) * 20) : 10;

  // 2. Technical Confirmation (15) — real ADX trend-strength/direction (Phase 2).
  const adx = technicals?.adx;
  let technicalPts = 7; // honest neutral midpoint when ADX isn't computable yet
  if (adx) {
    if (adx.strength === "Strong") technicalPts = adx.direction === "Bullish" ? 15 : adx.direction === "Bearish" ? 2 : 8;
    else if (adx.strength === "Developing") technicalPts = adx.direction === "Bullish" ? 11 : adx.direction === "Bearish" ? 5 : 8;
    else technicalPts = 8; // Weak/Range — genuinely no real trend signal either way
  }

  // 3. Smart Money (15) — real BOS/ChoCh/order-block structure (smc-engine.js),
  // already attached to every trend-screen row (Phase 2 of the Institutional Scanner work).
  const smc = row?.smc;
  let smartMoneyPts = 8; // honest neutral — no clear real structure signal
  if (smc?.bos?.type === "BULL_BOS") smartMoneyPts = 15;
  else if (smc?.bos?.type === "BEAR_BOS") smartMoneyPts = 3;
  else if (smc?.choch?.type === "CHOCH_BULL") smartMoneyPts = 12;
  else if (smc?.choch?.type === "CHOCH_BEAR") smartMoneyPts = 5;
  else if (smc?.nearestOB?.type === "BULL_OB") smartMoneyPts = 10;
  else if (smc?.nearestOB?.type === "BEAR_OB") smartMoneyPts = 6;

  // 4. Options Flow (15) — real call/put notional bias, when a real flow read is available.
  const callN = Number(optionsFlow?.callNotional), putN = Number(optionsFlow?.putNotional);
  const flowTotal = (Number.isFinite(callN) ? callN : 0) + (Number.isFinite(putN) ? putN : 0);
  const flowRatio = flowTotal > 0 ? callN / flowTotal : null;
  const optionsFlowPts = flowRatio != null ? Math.max(1, Math.min(15, Math.round(flowRatio * 14) + 1)) : 8;

  // 5. Fundamentals (15) — same real forward-vs-trailing EPS growth field
  // Stock Quality Score's own Fundamental Strength dimension uses, just
  // re-weighted here (this score's job is to blend it with the other real
  // categories below, not to duplicate that dimension's exact 10pt scale).
  const epsGrowth = Number(row?.epsGrowth);
  const fundamentalPts = Number.isFinite(epsGrowth) ? Math.round(Math.max(0, Math.min(1, (epsGrowth + 10) / 30)) * 15) : 7;

  // 6. Macro Regime (10) — same real 4-band SPY/QQQ/VIX regime used everywhere else.
  const macroPts = Math.round((Number(regime?.score) || 0) / 100 * 10);

  // 7. Sector Strength (10) — real sector-ETF rank today (1 = strongest of 11).
  const sectorPts = sectorInfo?.rank ? Math.round(((11 - sectorInfo.rank + 1) / 11) * 10) : 5;

  const score = Math.max(0, Math.min(100, trendPts + technicalPts + smartMoneyPts + optionsFlowPts + fundamentalPts + macroPts + sectorPts));
  const reasons = [
    Number.isFinite(passCount) ? `${passCount}/8 real Minervini trend-template criteria pass` : "Trend template data unavailable",
    adx ? `ADX ${adx.adx} (${adx.strength}), ${adx.direction} — +DI ${adx.plusDI} / -DI ${adx.minusDI}` : "ADX unavailable (insufficient history)",
    smc?.bos?.type ? smc.bos.label : smc?.choch?.type ? smc.choch.label : smc?.nearestOB?.type ? `Nearest real order block: ${smc.nearestOB.type === "BULL_OB" ? "bullish" : "bearish"}` : "No clear real market-structure signal",
    flowRatio != null ? `Real options flow ${Math.round(flowRatio * 100)}% call-weighted notional` : "Options flow data unavailable",
    Number.isFinite(epsGrowth) ? `EPS growth (fwd vs TTM): ${epsGrowth >= 0 ? "+" : ""}${epsGrowth}%` : "Forward EPS data unavailable",
    `Market regime ${regime?.label || "?"} (${regime?.score ?? "?"}/100)`,
    sectorInfo?.rank ? `Sector rank #${sectorInfo.rank}/${sectorInfo.of} today` : "Sector rank unavailable",
  ];
  return {
    score, reasons, cautions: [],
    breakdown: { trendPts, technicalPts, smartMoneyPts, optionsFlowPts, fundamentalPts, macroPts, sectorPts },
  };
}

// Letter-grade read for computeInstitutionalGrade's 0-100 score — a
// bond/institutional-rating style label (distinct visual language from the
// numeric-only Stock Quality/Trade Setup badges) since this score is
// explicitly framed as an "institutional grade", not a raw setup score.
export function institutionalLetterGrade(score) {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B+";
  if (score >= 60) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "F";
}

// Bull Case / Bear Case — free, deterministic (explicit user request,
// 2026-07-29, "use free data" — the paid Claude version hit the account's
// API usage limit, so this replaces it entirely, same "Free, deterministic,
// not an AI call" framing the Quick Read prediction card already uses).
// Reuses computeInstitutionalGrade's own real per-dimension reasons —
// zero new computation, zero new fetch, zero API cost. A dimension scoring
// >=65% of its max real points becomes a bull point; <=35% becomes a bear
// point; the real middle ground is left out of both (it's genuinely
// neutral, not a weak case for either side).
export function computeBullBearCase(institutionalGrade, dimensions) {
  if (!institutionalGrade || !dimensions) return { bull: [], bear: [] };
  const bull = [], bear = [];
  dimensions.forEach((d, i) => {
    const pts = institutionalGrade.breakdown[d.key];
    const reason = institutionalGrade.reasons[i];
    if (pts == null || !reason) return;
    const ratio = pts / d.max;
    if (ratio >= 0.65) bull.push(`${d.label}: ${reason}`);
    else if (ratio <= 0.35) bear.push(`${d.label}: ${reason}`);
  });
  return { bull, bear };
}

// Strong Buy / Buy / Hold / Sell / Strong Sell + star count — a real,
// deterministic label on computeInstitutionalGrade's real 0-100 score
// (explicit user request, 2026-07-29, "AI Score Card" concept). Not a
// separate AI call or a new number — the same score, just given the plain-
// English recommendation label institutional research platforms use.
export function institutionalRecommendation(score) {
  if (score >= 85) return { label: "Strong Buy", stars: 5, color: "#0d9465" };
  if (score >= 70) return { label: "Buy", stars: 4, color: "#22a06b" };
  if (score >= 45) return { label: "Hold", stars: 3, color: "#d6a312" };
  if (score >= 25) return { label: "Sell", stars: 2, color: "#e07b1a" };
  return { label: "Strong Sell", stars: 1, color: "#c8282a" };
}

// Real win-probability lookup — moved here from RhProScanner.jsx
// (2026-07-29, so MarketTerminalTab's AI Score Card can reuse the exact
// same real number instead of re-deriving it) — Phase 3 of the
// Institutional Scanner work originally. Reuses /api/market/aplus-track's
// real forward-return log (aplus-score-history.js), bucketed by the row's
// real Trade Setup Score band. Prefers a longer real horizon (more
// representative of a swing hold) but falls back to whichever horizon
// actually has enough real samples. Below MIN_WIN_SAMPLE real observations,
// returns the honest sample count instead of a fabricated-looking
// percentage — this platform's forward log is one ~60-symbol daily
// snapshot, never thousands of setups.
export const MIN_WIN_SAMPLE = 10;
export function winProbBucketOf(score) {
  if (score >= 80) return "80-100";
  if (score >= 60) return "60-79";
  if (score >= 40) return "40-59";
  return "0-39";
}
export function winProbFor(track, score) {
  if (!track?.horizons) return null;
  const bucket = winProbBucketOf(score);
  for (const h of ["d20", "d10", "d5", "d60"]) {
    const b = track.horizons[h]?.buckets?.[bucket];
    if (b && b.count >= MIN_WIN_SAMPLE) return { winRate: b.winRate, count: b.count, horizon: h.slice(1) };
  }
  let best = null;
  for (const h of ["d20", "d10", "d5", "d60"]) {
    const b = track.horizons[h]?.buckets?.[bucket];
    if (b && (!best || b.count > best.count)) best = { count: b.count, horizon: h.slice(1) };
  }
  return best ? { winRate: null, count: best.count, horizon: best.horizon } : null;
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

// Price Prediction — real, deterministic ~1-week direction + target, shared
// so it can show up wherever a stock is already being analyzed (Market
// Terminal, Sniper Scanner, Pro Watchlists) instead of living only on its
// own standalone tab (extracted from PredictionsTab.jsx 2026-07-28, same
// logic, zero behavior change for that tab). Real inputs: `trend`'s Stage
// classification, pctFromHigh, volRatio (the same trend-template scan every
// other score in this app trusts) plus `q`'s today's %change and day range
// for the ATR-based target. `q` and `trend` can be the SAME object when a
// caller only has one row (e.g. a scanner row with no separate live quote)
// — the trend-based scoring (the dominant part) still runs fully; only the
// smaller today's-%-change component and the day-range ATR silently fall
// back to a neutral default (0 / 2.5%) rather than fabricating a number.
export function computePrediction(q, trend) {
  const px = Number(q?.price || q?.regularMarketPrice || 0);
  if (!px) return null;
  const chg = Number(q?.changesPercentage || 0);

  let score = 0; const why = [];

  if (trend) {
    const stage = String(trend.stage || "");
    if (stage.startsWith("Stage 2"))      { score += 30; why.push("Stage 2 uptrend (real trend template)"); }
    else if (stage.startsWith("Stage 4")) { score -= 30; why.push("Stage 4 downtrend (real trend template)"); }
    else if (stage.startsWith("Stage 3")) { score -= 15; why.push("Stage 3 topping/distribution"); }

    const pfh = Number(trend.pctFromHigh);
    if (Number.isFinite(pfh)) {
      if (pfh > -5)        { score += 12; why.push("Within 5% of 52W high — momentum"); }
      else if (pfh < -40)  { score -= 10; why.push(`${Math.abs(pfh).toFixed(0)}% below 52W high — weak`); }
    }

    const vr = Number(trend.volRatio);
    if (Number.isFinite(vr) && vr > 1.8) {
      if (chg > 0)      { score += 15; why.push(`Volume surge ${vr.toFixed(1)}x on green`); }
      else if (chg < 0) { score -= 15; why.push(`Volume surge ${vr.toFixed(1)}x on red`); }
    }
  }
  if (chg > 3)       { score += 10; why.push("Strong momentum today"); }
  else if (chg < -3) { score -= 10; why.push("Heavy selling today"); }

  const dayRange = (Number(q?.dayHigh || 0) - Number(q?.dayLow || 0));
  const atrPct = px > 0 && dayRange > 0 ? (dayRange / px) : 0.025;
  const conf = Math.min(90, 50 + Math.abs(score) / 2);
  const dir  = score >= 20 ? "BULLISH" : score >= 8 ? "LEAN UP" : score <= -20 ? "BEARISH" : score <= -8 ? "LEAN DOWN" : "NEUTRAL";
  // Cap the ATR so a single huge-move day doesn't produce absurd targets
  const cappedAtr = Math.min(atrPct, 0.05); // max 5% daily range used
  let weeklyMove = cappedAtr * Math.sqrt(5) * 100;
  weeklyMove = Math.min(weeklyMove, 12); // hard cap weekly expected move at 12%
  const biasMult = score >= 8 ? 1 : score <= -8 ? -1 : 0;
  const target = +(px * (1 + biasMult * weeklyMove / 100)).toFixed(2);
  const movePct = +(biasMult * weeklyMove).toFixed(1);
  return { px, chg, dir, conf: Math.round(conf), score, why: why.slice(0, 3), target, movePct, atrPct: cappedAtr };
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
