import { mapToOptionsAction } from "./options-actions.js";

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

// Canonical Market Bias — options platform redesign Phase 1 (2026-08-02,
// spec: "Market Bias: Bullish/Bearish/Neutral, Confidence %"). This app had
// 3 real, independently-computed regime formulas that could legitimately
// disagree with no reconciliation: computeRegime() above (0-100 SPY/QQQ/VIX
// gauge), DashboardTab.jsx's computeRegimeLabel (rule-based RISK OFF/RISK
// ON/CHOP/CAUTIOUS BULL/DEFENSIVE), and MarketCommandCenterStrip's own
// SPY/QQQ/VIXY/TLT/UUP/HYG weighted risk score. None of the three are
// touched or replaced here — this is a new presentation layer that reads
// all three real outputs and reports where they agree (high confidence) or
// diverge (lower confidence), the same "aggregate, don't rewrite" pattern
// deriveTopLevelScores already established. computeRegimeLabel's own rule
// logic is mirrored inline (not imported) purely to avoid a circular
// import — DashboardTab.jsx already imports FROM this file — but the exact
// same real conditions/thresholds are reproduced faithfully, quirks (e.g.
// vix=0 when unloaded reads as "calm") included, since fixing that formula
// is out of scope for a reconciliation layer.
export function computeMarketBias({ macroData, distData } = {}) {
  const find = s => (macroData || []).find(m => (m.symbol || "").toUpperCase() === s);
  const spy = find("SPY"), qqq = find("QQQ");
  const chg = q => Number(q?.changesPercentage || 0);
  const vix = Number(distData?.vix) || 0;

  if (!spy) return { bias: null, confidence: null, character: null, riskPosture: null, label: "—" };

  const regime = computeRegime(macroData);
  const regimeDir = regime.score >= 55 ? 1 : regime.score < 40 ? -1 : 0;

  const spyChg = chg(spy), qqqChg = chg(qqq);
  const ruleDir = (vix > 30 || spyChg < -1.5) ? -1
    : (vix < 16 && spyChg > 0.3 && qqqChg > 0.3) ? 1
    : (Math.abs(spyChg) < 0.3 && vix < 22) ? 0
    : (spyChg > 0.5) ? 1
    : -1; // DEFENSIVE fallback — "smaller size, favor defensive sectors" is bearish-leaning, not neutral

  const vixy = find("VIXY"), tlt = find("TLT"), uup = find("UUP"), hyg = find("HYG");
  let riskScore = 50 + chg(spy) * 8 + chg(qqq) * 6 - chg(vixy) * 3 + chg(tlt) * 2 - chg(uup) * 3 + chg(hyg) * 4;
  riskScore = Math.max(0, Math.min(100, Math.round(riskScore)));
  const riskDir = riskScore >= 65 ? 1 : riskScore < 40 ? -1 : 0;

  const dirs = [regimeDir, ruleDir, riskDir];
  const bullVotes = dirs.filter(d => d === 1).length;
  const bearVotes = dirs.filter(d => d === -1).length;
  const neutralVotes = dirs.filter(d => d === 0).length;
  const bias = bullVotes > bearVotes ? "Bullish" : bearVotes > bullVotes ? "Bearish" : "Neutral";

  // Confidence — an honest measure of how much the 3 real formulas agree,
  // not a fabricated precision number: unanimous -> 90, 2-of-3 -> 65,
  // no majority (e.g. 1/1/1 split) -> 40.
  const maxAgree = Math.max(bullVotes, bearVotes, neutralVotes);
  const confidence = maxAgree === 3 ? 90 : maxAgree === 2 ? 65 : 40;

  // Character — Trending/Range/Volatile/Low Volatility. ADX (the real
  // per-symbol trend-strength read used elsewhere in this file) isn't
  // meaningful at a market-wide level, so this reuses computeRegime's own
  // real "Trend day" factor (|SPY chg| > 0.4%) for trend-strength and real
  // VIX level for volatility — both already-real inputs above, no new
  // fetches.
  const trendDayFactor = regime.factors?.find(f => f.label === "Trend day");
  let character;
  if (vix >= 25) character = "Volatile";
  else if (vix > 0 && vix < 14) character = "Low Volatility";
  else if (trendDayFactor?.pass) character = "Trending";
  else character = "Range";

  const riskPosture = riskScore >= 65 ? "Risk On" : riskScore < 40 ? "Risk Off" : "Caution";

  return {
    bias, confidence, character, riskPosture,
    label: `${bias} · ${confidence}%`,
    sources: { regimeScore: regime.score, regimeLabel: regime.label, riskScore, vix },
  };
}

// Regime → options-strategy mapping table (spec item 6: "Trending → Buy
// Calls", "High IV → Credit Spread", "Low IV → Long Calls", "Sideways →
// Iron Condor"). A deterministic lookup, not a formula — genuinely missing
// before this (the existing Command Center "Best Strategy Today" cell only
// ever names an equity trading style, never an options structure). Takes
// computeMarketBias()'s own real {bias, character} plus real VIX for the
// IV-level split — a market-wide IV proxy, not a per-contract read; the
// honest per-contract version is the options chain's own real IV field,
// used once the Option Recommender (Phase 4) ships.
export function regimeStrategyHint({ bias, character, vix } = {}) {
  const v = Number(vix) || 0;
  if (character === "Trending" && bias === "Bullish") return "Buy Calls";
  if (character === "Trending" && bias === "Bearish") return "Buy Puts";
  if (v >= 25) return "Credit Spread";
  if (v > 0 && v < 15) return "Long Calls/Puts";
  if (character === "Range") return "Iron Condor";
  return "Wait for Confirmation";
}

// A+ Market Score — options platform redesign Phase 1 (spec: "A+ Market
// Score" on the Home Dashboard). A market-wide aggregate: what % of the
// tracked scan universe is currently scoring A+/A grade. Zero new
// computation or fetch — `rows` is the app's existing `fullScan` array
// (DashboardTab.jsx already receives it as a prop; it's TopOpportunityCard's
// real per-symbol computeAPlusScore() results across the full SCAN_UNIVERSE,
// refreshed every 60s for the existing AI Top Opportunities card). This
// function only counts, using the same 85/70 score thresholds
// AiTopOpportunitiesCard already renders with (gold/green tiers,
// DashboardTab.jsx's scoreCol logic) — not new boundaries.
export function computeAPlusMarketScore(rows) {
  const scored = (rows || []).map(r => r?._aplus?.score).filter(s => Number.isFinite(s));
  const total = scored.length;
  if (total === 0) return { pct: null, aPlusCount: 0, aCount: 0, total: 0 };
  const aPlusCount = scored.filter(s => s >= 85).length;
  const aCount = scored.filter(s => s >= 70).length; // includes aPlusCount
  const pct = Math.round((aCount / total) * 100);
  return { pct, aPlusCount, aCount, total };
}

// Macro instrument status classifier — options platform redesign Phase 1
// (spec: "SPY, QQQ, IWM, DIA, VIX, DXY, 10Y Treasury, Gold, Oil, BTC — show
// Green/Yellow/Red instead of dozens of numbers"). VIX is a special case,
// classified by real absolute level using the exact same thresholds
// already established in DashboardTab.jsx's Command Center strip (red>25,
// green<16, amber between) — this MUST be the real VIX index level
// (distData.vix), not the VIXY ETF's own price, since VIXY's price scale
// (roll-decay-driven, roughly $8-30) does not correspond to the VIX
// index's 16/25 levels at all; passing VIXY's price here would silently
// misclassify. Every other instrument uses one consistent, documented
// %-change rule — the direction of that instrument's own move today, not
// a judgment call about what the move "means" for other assets (e.g. DXY
// strength/weakness is regime-dependent and out of scope for a simple
// glance-status indicator).
export function classifyMacroStatus(symbol, { chgPct, vixLevel } = {}) {
  const sym = String(symbol || "").toUpperCase();
  if (sym === "VIX") {
    const level = Number(vixLevel) || 0;
    if (level <= 0) return { status: "neutral", label: "—" };
    if (level > 25) return { status: "red", label: "Elevated" };
    if (level < 16) return { status: "green", label: "Calm" };
    return { status: "yellow", label: "Mixed" };
  }
  const c = Number(chgPct) || 0;
  if (c >= 0.5) return { status: "green", label: "Up" };
  if (c <= -0.5) return { status: "red", label: "Down" };
  return { status: "yellow", label: "Flat" };
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

// AI Trade Engine score — options platform redesign Phase 3 (spec: "AI
// Score 0-100" with a Trend/Momentum/Volume/Relative Strength/Options
// Flow/Dark Pool/News/Gamma/Liquidity/Institutional Activity breakdown +
// Final Recommendation). A NEW sibling 10-dimension composite, not an
// extension of computeInstitutionalGrade's own 100 points (its internals
// are never touched, per the redesign's guiding constraint) — 6 of the 10
// requested dimensions were already real, scored signals somewhere in this
// app (Trend/Momentum/Volume/RS/Options Flow/Institutional Activity, via
// computeInstitutionalGrade and real trend-screen row fields); this
// function re-derives them at this score's own weighting and adds the 4
// genuinely-missing dimensions (Dark Pool/News/Gamma/Liquidity) on real
// inputs from Phase 0/2's new modules. Every dimension degrades to an
// honest neutral midpoint (never a guess) when its real input isn't
// available.
export function computeAiTradeScore({ row, optionsFlow, darkPool, newsSentiment, gammaExposure, liquidityScore } = {}) {
  // 1. Trend (15) — same real Minervini trend-template pass count computeInstitutionalGrade uses, rescaled 20->15.
  const passCount = Number(row?.passCount);
  const trendPts = Number.isFinite(passCount) ? Math.round((passCount / 8) * 15) : 8;

  // 2. Momentum (10) — real IBD-style weighted momentum % already attached
  // to every trend-screen row (src/routes/market.js's ttWeightedMomentum).
  // Scaled with the same (x+10)/30 real-to-0-1 mapping computeInstitutionalGrade's
  // own Fundamentals dimension already uses for a similarly-shaped real %.
  const momentum = Number(row?.momentum);
  const momentumPts = Number.isFinite(momentum) ? Math.round(Math.max(0, Math.min(1, (momentum + 10) / 30)) * 10) : 5;

  // 3. Volume (10) — same real volRatio-vs-50-day-average computeAPlusScore uses.
  const volRatio = Number(row?.volRatio);
  const volumePts = Number.isFinite(volRatio) ? Math.round(Math.max(0, Math.min(1, volRatio / 2)) * 10) : 5;

  // 4. Relative Strength (10) — the real 1-99 percentile RS rating already
  // computed for every trend-screen row (percentile rank of weighted momentum
  // across the whole scanned universe).
  const rsRating = Number(row?.rsRating);
  const rsPts = Number.isFinite(rsRating) ? Math.round((rsRating / 99) * 10) : 5;

  // 5. Options Flow (10) — same real call/put notional bias computeInstitutionalGrade uses, rescaled 15->10.
  const callN = Number(optionsFlow?.callNotional), putN = Number(optionsFlow?.putNotional);
  const flowTotal = (Number.isFinite(callN) ? callN : 0) + (Number.isFinite(putN) ? putN : 0);
  const flowRatio = flowTotal > 0 ? callN / flowTotal : null;
  const optionsFlowPts = flowRatio != null ? Math.max(1, Math.min(10, Math.round(flowRatio * 9) + 1)) : 5;

  // 6. Dark Pool (10) — real total notional value of real block prints
  // (Unusual Whales, already $500K+-filtered by fetchDarkPoolPrints). This
  // data source exposes no buy/sell side, so this is a real MAGNITUDE-of-
  // institutional-participation read, not a directional call — never
  // invents a bullish/bearish bias this data can't actually support.
  const darkPoolNotional = (darkPool?.prints || []).reduce((s, p) => s + (Number(p.value) || 0), 0);
  const darkPoolPts = darkPool ? Math.round(Math.max(0, Math.min(1, darkPoolNotional / 20_000_000)) * 10) : 5;

  // 7. News (10) — Phase 0's real per-symbol headline sentiment aggregate
  // (aggregateSentimentForSymbol, src/routes/agent.js), a real -5..5 score.
  const newsScore = Number(newsSentiment?.score);
  const newsPts = Number.isFinite(newsScore) ? Math.round(((newsScore + 5) / 10) * 10) : 5;

  // 8. Gamma (10) — Phase 2's real GEX (src/gamma-exposure.js). Honest
  // neutral midpoint when unavailable (no Polygon key, or no real gamma
  // for this symbol). When available, scores structural significance —
  // how close price sits to the real gamma flip point, a well-established
  // "dealer hedging flips, moves can amplify" zone — rather than inventing
  // a bullish/bearish read that GEX sign alone can't reliably support.
  let gammaPts = 5;
  if (gammaExposure?.available && Number.isFinite(gammaExposure.gammaFlipPoint) && Number.isFinite(row?.price) && row.price > 0) {
    const distPct = Math.abs(row.price - gammaExposure.gammaFlipPoint) / row.price;
    gammaPts = 5 + Math.round(Math.max(0, Math.min(1, (0.05 - Math.min(distPct, 0.05)) / 0.05)) * 5);
  }

  // 9. Liquidity (5) — Phase 0's real options-math.js liquidityScore (0-100)
  // on the symbol's ATM contract, passed in by whichever page already
  // fetched a real chain for this symbol. Smaller weight since it
  // describes the options contract's tradability, not the underlying
  // stock itself.
  const liquidityPts = Number.isFinite(liquidityScore) ? Math.round((liquidityScore / 100) * 5) : 3;

  // 10. Institutional Activity (10) — same real BOS/ChoCh/order-block
  // structure (smc-engine.js) computeInstitutionalGrade uses, rescaled 15->10.
  const smc = row?.smc;
  let institutionalPts = 5;
  if (smc?.bos?.type === "BULL_BOS") institutionalPts = 10;
  else if (smc?.bos?.type === "BEAR_BOS") institutionalPts = 2;
  else if (smc?.choch?.type === "CHOCH_BULL") institutionalPts = 8;
  else if (smc?.choch?.type === "CHOCH_BEAR") institutionalPts = 3;
  else if (smc?.nearestOB?.type === "BULL_OB") institutionalPts = 7;
  else if (smc?.nearestOB?.type === "BEAR_OB") institutionalPts = 4;

  const breakdown = { trendPts, momentumPts, volumePts, rsPts, optionsFlowPts, darkPoolPts, newsPts, gammaPts, liquidityPts, institutionalPts };
  const score = Math.max(0, Math.min(100, Object.values(breakdown).reduce((a, b) => a + b, 0)));

  const reasons = [
    Number.isFinite(passCount) ? `${passCount}/8 real Minervini trend-template criteria pass` : "Trend template data unavailable",
    Number.isFinite(momentum) ? `Weighted momentum ${momentum >= 0 ? "+" : ""}${momentum.toFixed(1)}%` : "Momentum data unavailable",
    Number.isFinite(volRatio) ? `Volume ${volRatio.toFixed(1)}x the 50-day average` : "Volume data unavailable",
    Number.isFinite(rsRating) ? `RS rating ${rsRating}/99` : "RS rating unavailable",
    flowRatio != null ? `Real options flow ${Math.round(flowRatio * 100)}% call-weighted notional` : "Options flow data unavailable",
    darkPool ? (darkPoolNotional > 0 ? `$${(darkPoolNotional / 1e6).toFixed(1)}M in real dark pool block prints` : "No real block prints above $500K") : "Dark pool data unavailable",
    Number.isFinite(newsScore) ? `Real news sentiment ${newsScore >= 0 ? "+" : ""}${newsScore} (${newsSentiment.bulls} bull / ${newsSentiment.bears} bear headlines)` : "News sentiment unavailable",
    gammaExposure?.available ? `Real gamma flip point $${gammaExposure.gammaFlipPoint}` : "Gamma data unavailable",
    Number.isFinite(liquidityScore) ? `Options liquidity score ${liquidityScore}/100` : "Options liquidity data unavailable",
    smc?.bos?.type ? smc.bos.label : smc?.choch?.type ? smc.choch.label : smc?.nearestOB?.type ? `Nearest real order block: ${smc.nearestOB.type === "BULL_OB" ? "bullish" : "bearish"}` : "No clear real market-structure signal",
  ];

  // Final Recommendation — options-actions.js's unified calls-vs-puts
  // vocabulary applied to this composite score, not a new formula (closes
  // the loop between the spec's "AI Score breakdown" and "Final
  // Recommendation" asks).
  const chgPct = Number(row?.chgPct) || 0;
  const recommendation = mapToOptionsAction({ score, chgPct });

  return { score, breakdown, reasons, recommendation };
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

// Six-score consolidation — presentation layer ONLY (institutional redesign,
// 2026-07-29, explicit user spec: "Six core scores only: Market, Sector,
// Stock Quality, Institutional, Technical, Timing"). Deliberately does NOT
// touch computeInstitutionalGrade/computeAPlusScore/stockQualityBreakdown's
// own math — every one of the six below is either a direct passthrough of
// an already-computed real number, or a light re-weighting of already-
// computed real sub-dimensions. Zero new fetches, zero new API cost.
//
// Real, known overlap, not a bug: Institutional Grade's own Macro Regime(10)
// and Sector Strength(10) sub-dimensions ARE the same real numbers behind
// the Market/Sector scores below — Institutional already weighs them as two
// of its seven inputs. They're surfaced separately here so a user can see
// *why* Institutional moved, not as additional independent signals. Same
// "these can legitimately disagree, that's not a bug" framing already
// shipped for Trend & Base Rating vs the AI Score Card.
export function deriveTopLevelScores({ regime, sectorInfo, technicals, institutionalGrade, stockQuality, aPlusScore }) {
  const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
  const bandOf = (score) => score == null
    ? { label: "—", color: "#94a3b8" }
    : score >= 70 ? { label: "Strong", color: "#22a06b" }
    : score >= 45 ? { label: "Neutral", color: "#d6a312" }
    : { label: "Weak", color: "#c8282a" };

  // Market — real regime score (computeRegime), passed through unchanged.
  const marketScore = Number.isFinite(Number(regime?.score)) ? clamp(regime.score) : null;

  // Sector — real 1-11 sector-ETF rank vs SPY (same rank Institutional
  // Grade's own Sector Strength dimension uses), rescaled so rank 1 = 100.
  const sectorScore = sectorInfo?.rank ? clamp(100 - ((sectorInfo.rank - 1) / 10) * 100) : null;

  // Stock Quality / Institutional — already complete, standalone 0-100
  // scores; pure passthrough, no re-derivation.
  const stockQualityScore = Number.isFinite(Number(stockQuality?.score)) ? clamp(stockQuality.score) : null;
  const institutionalScore = Number.isFinite(Number(institutionalGrade?.score)) ? clamp(institutionalGrade.score) : null;

  // Technical (new) — 60% Institutional Grade's own real ADX-based
  // Technical Confirmation dimension (trend strength/direction), 40% a real
  // Donchian-channel/Bollinger-%B blend (both already computed on the same
  // daily bars, `chart.technicals` — where price sits in its recent real
  // range, a genuine complementary read to ADX's trend-strength/direction).
  // Breakdown/reasons shaped to plug directly into AiScoreExplainer's
  // existing {breakdown, reasons} convention (TECHNICAL_DIMENSIONS below).
  const technicalPts = institutionalGrade?.breakdown?.technicalPts;
  const adxComponent = technicalPts != null ? (technicalPts / 15) * 100 : null;
  const donchianPos = Number(technicals?.donchian?.pctPosition);
  const bollingerB = Number(technicals?.bollinger?.percentB);
  const rangeReads = [donchianPos, bollingerB].filter((v) => Number.isFinite(v));
  const rangeComponent = rangeReads.length ? rangeReads.reduce((s, v) => s + v, 0) / rangeReads.length : null;
  const adxPts = adxComponent != null ? Math.round(adxComponent * 0.6) : null;
  const rangePts = rangeComponent != null ? Math.round(rangeComponent * 0.4) : null;
  const technicalScore = adxPts != null && rangePts != null ? clamp(adxPts + rangePts)
    : adxPts != null ? clamp(adxPts / 0.6)
    : rangePts != null ? clamp(rangePts / 0.4)
    : null;
  const technicalReasons = [
    institutionalGrade?.reasons?.[1] || "ADX unavailable (insufficient history)",
    rangeComponent != null
      ? `Donchian ${Number.isFinite(donchianPos) ? donchianPos.toFixed(0) : "—"}% of the 20-day range, Bollinger %B ${Number.isFinite(bollingerB) ? bollingerB.toFixed(0) : "—"} — where price sits in its recent real range`
      : "Donchian/Bollinger range position unavailable (insufficient history)",
  ];

  // Timing (new) — strict subset-sum of Trade Setup Score's OWN Entry
  // Timing(20) + Breakout Confirmation(15) + Volatility/Base Tightness(5)
  // sub-dimensions, each rescaled proportionally into a 0-100 total
  // (50/38/12 max split) so the breakdown modal's parts sum to the same
  // scale as the headline score. No cross-function blending — the
  // lowest-risk of the two new derived scores.
  const ab = aPlusScore?.breakdown;
  const timingMax = { entryPts: 50, breakoutPts: 38, volatilityPts: 12 };
  const timingBreakdown = ab ? {
    entryPts: Math.round((ab.entryPts / 20) * timingMax.entryPts),
    breakoutPts: Math.round((ab.breakoutPts / 15) * timingMax.breakoutPts),
    volatilityPts: Math.round((ab.volatilityPts / 5) * timingMax.volatilityPts),
  } : null;
  const timingScore = timingBreakdown ? clamp(timingBreakdown.entryPts + timingBreakdown.breakoutPts + timingBreakdown.volatilityPts) : null;
  const timingReasons = [
    aPlusScore?.reasons?.[1] || "Pivot distance unavailable",
    aPlusScore?.reasons?.[2] || "Breakout confirmation unavailable",
    aPlusScore?.reasons?.[6] || "VCP base data unavailable",
  ];

  return {
    market: { score: marketScore, ...bandOf(marketScore) },
    sector: { score: sectorScore, ...bandOf(sectorScore) },
    stockQuality: { score: stockQualityScore, ...bandOf(stockQualityScore) },
    institutional: { score: institutionalScore, ...bandOf(institutionalScore) },
    technical: { score: technicalScore, ...bandOf(technicalScore), breakdown: { adxPts, rangePts }, reasons: technicalReasons },
    timing: { score: timingScore, ...bandOf(timingScore), breakdown: timingBreakdown, reasons: timingReasons, timingMax },
  };
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
