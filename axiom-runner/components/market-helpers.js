import { mapToOptionsAction } from "./options-actions.js";
import { computeAntiChase } from "./anti-chase.js";

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
  // sixBand: additive-only field, parity with the server copy in
  // src/trade-planner-scoring.js — see that file's comment for why `label`
  // itself must never change.
  const sixBand = score >= 85 ? "STRONG_BULL" : score >= 70 ? "BULL" : score >= 55 ? "NEUTRAL" : score >= 40 ? "TRANSITION" : score >= 25 ? "BEAR" : "STRONG_BEAR";
  return { score, label, color, factors, vixVal, sixBand };
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
  // Reduced from 20→15 (2026-08-14, VCP engine integration Phase 2) to make
  // room for the new standalone VCP Setup Score dimension below — real
  // overlap already existed here (VCP's own pivot-distance sub-component).
  const abovePivotPct = Number(row?.abovePivotPct);
  const idealDist = !Number.isFinite(abovePivotPct) ? null
    : abovePivotPct < 0 ? -abovePivotPct : Math.max(0, abovePivotPct - 5);
  const entryPts = idealDist == null ? 8 : Math.round(Math.max(0, Math.min(1, (15 - idealDist) / 15)) * 15);

  // 3. Breakout confirmation — actionability plus the real breakout-engine
  // confidence (0-100, from vcpBreakoutEngine) when a breakout state exists.
  // Reduced from 15→10 (2026-08-14, VCP Phase 2) — vcpReport's own real
  // 10-pt breakout-readiness sub-component now covers most of this signal
  // more precisely; kept as its own dimension rather than removed since it
  // also reflects the app's separate Minervini trend-template actionability
  // gate, not purely VCP-derived.
  const isGo = row?.verdict === "GO" || (row?.atBuyPoint && row?.volConfirmed);
  const breakoutConf = Number(row?.confidence) || 0;
  const breakoutBase = isGo ? 8 : row?.actionable ? 5 : 0;
  const breakoutBonus = Math.round((breakoutConf / 100) * 2);
  const breakoutPts = Math.min(10, breakoutBase + breakoutBonus);

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

  // 7. VCP Setup Score — the real, standalone 0-100 score from vcpReport()
  // (src/routes/market.js), a genuine 5-component rubric (trend/contraction/
  // volatility/volume/breakout) built specifically to grade a Volatility
  // Contraction Pattern base — not this app's own crude tightening-flag
  // proxy it replaces. 2026-08-14, VCP engine integration Phase 2 ("Add VCP
  // as another input" per the user's own spec — additive, not a new/second
  // A+ engine). Honest half-credit default when vcpScore isn't on the row
  // yet (e.g. a scan payload from before this field existed), never a guess.
  const vcpScoreRaw = Number(row?.vcpScore);
  const vcpPts = Number.isFinite(vcpScoreRaw) ? Math.round((vcpScoreRaw / 100) * 15) : 7;

  const score = Math.max(0, Math.min(100, regimePts + entryPts + breakoutPts + volPts + riskPts + supportPts + vcpPts));
  const cautions = [];
  if (row?.earningsSoon) cautions.push(`⚠️ Earnings within ${row.earningsDte} day${row.earningsDte === 1 ? "" : "s"} — added gap risk (not scored, timing-only caution)`);
  const reasons = [
    `Market regime ${regime?.label || "?"} (${regimeScore}/100)${regimeScore >= 75 ? " — favorable for breakouts" : regimeScore >= 55 ? " — mixed, be selective" : " — unfavorable, high failure risk"}`,
    idealDist == null ? "Pivot distance unavailable" : computeAntiChase(abovePivotPct).label,
    isGo ? `At buy point with volume confirmation${breakoutConf ? ` (${breakoutConf}% breakout confidence)` : ""}` : row?.actionable ? "Near pivot, not yet confirmed" : "Not yet actionable",
    Number.isFinite(volRatio) ? `Volume ${volRatio.toFixed(1)}x the 50-day average` : "Volume data unavailable",
    Number.isFinite(riskPct) && riskPct > 0 ? `${riskPct.toFixed(1)}% risk to stop — ${riskPct <= 5 ? "tight, low-risk entry" : riskPct <= 8 ? "moderate risk" : "wide stop, higher risk"}` : "Risk distance unavailable",
    Number.isFinite(pctFromHigh) ? `${Math.abs(pctFromHigh).toFixed(1)}% ${pctFromHigh < 0 ? "below" : "at"} the 52-week high` : "52-week high distance unavailable",
    Number.isFinite(vcpScoreRaw) ? `VCP Setup Score ${vcpScoreRaw}/100${row?.vcpVerdict ? ` (${row.vcpVerdict})` : ""}` : "No real VCP base detected",
  ];
  return { score, reasons, cautions, breakdown: { regimePts, entryPts, breakoutPts, volPts, riskPts, supportPts, vcpPts }, passCount };
}

// Fundamentals deep-dive — "why is this stock good or bad" (explicit user
// request, 2026-08-04: "fundamental is too basic i need deep dive why
// stock is good or why is bad"). The FundamentalsPanel stat boxes (P/E,
// P/S, P/B, PEG, Beta, Div Yield, Rev/EPS growth, margins, ROE) are real
// numbers but no verdict — a trader still has to know what "P/E 31.6"
// MEANS. This turns the SAME already-fetched fundamentals payload into
// real bull/bear reasons, reusing the exact threshold bands already
// established elsewhere in this app rather than inventing new judgment
// calls: P/E bands from trading-utils.js's real Green Light fundamental
// sub-score (<15 value / <25 reasonable / 40-50 neutral / >50 expensive),
// PEG/revenue-growth/earnings-growth/profit-margin bands from
// src/advisor-ai.js's computeFundamentalScore (server-side only, so
// re-implemented client-side here with the identical real cutoffs, not a
// second diverging definition). P/S, P/B, Beta, and Dividend Yield are
// deliberately left out of the verdict — no established "good/bad"
// threshold for them exists anywhere else in this codebase, and inventing
// one under time pressure would be a fabricated judgment, not a real one;
// they stay informational-only in the stat boxes above. Every reason
// cites the real number driving it; missing fields are silently skipped,
// never guessed.
export function computeFundamentalsRead(f) {
  const bull = [], bear = [];
  if (!f) return { bull, bear };
  const pe = Number(f.pe ?? f.trailingPE);
  if (Number.isFinite(pe) && pe > 0) {
    if (pe < 15) bull.push(`P/E of ${pe.toFixed(1)} is cheap — priced well below the broad market`);
    else if (pe < 25) bull.push(`P/E of ${pe.toFixed(1)} is a reasonable valuation`);
    else if (pe > 50) bear.push(`P/E of ${pe.toFixed(1)} is expensive — priced for a lot of future growth to show up`);
  }
  const peg = Number(f.pegRatio);
  if (Number.isFinite(peg) && peg > 0) {
    if (peg < 1) bull.push(`PEG of ${peg.toFixed(2)} — cheap relative to its own growth rate`);
    else if (peg < 2) bull.push(`PEG of ${peg.toFixed(2)} — fairly priced relative to growth`);
    else if (peg >= 3) bear.push(`PEG of ${peg.toFixed(2)} — expensive relative to its own growth rate`);
  }
  const rev = Number(f.revenueGrowth);
  if (Number.isFinite(rev)) {
    if (rev >= 0.20) bull.push(`Revenue growing ${(rev * 100).toFixed(1)}% — strong top-line expansion`);
    else if (rev >= 0.10) bull.push(`Revenue growing ${(rev * 100).toFixed(1)}%`);
    else if (rev < 0) bear.push(`Revenue shrinking ${(rev * 100).toFixed(1)}%`);
  }
  const eps = Number(f.earningsGrowth);
  if (Number.isFinite(eps)) {
    if (eps >= 0.20) bull.push(`Earnings growing ${(eps * 100).toFixed(1)}% — strong bottom-line expansion`);
    else if (eps >= 0.10) bull.push(`Earnings growing ${(eps * 100).toFixed(1)}%`);
    else if (eps < 0) bear.push(`Earnings shrinking ${(eps * 100).toFixed(1)}%`);
  }
  const pm = Number(f.profitMargin);
  if (Number.isFinite(pm)) {
    if (pm >= 0.20) bull.push(`Profit margin ${(pm * 100).toFixed(1)}% — highly profitable`);
    else if (pm >= 0.10) bull.push(`Profit margin ${(pm * 100).toFixed(1)}% — solidly profitable`);
    else if (pm < 0) bear.push(`Negative profit margin (${(pm * 100).toFixed(1)}%) — losing money on every dollar of revenue`);
  }
  return { bull, bear };
}

// Single UNDERVALUED/FAIRLY VALUED/OVERVALUED verdict (explicit user request,
// 2026-08-04: "show when stock undervalue and when overvalue") — same real
// P/E and PEG bands as computeFundamentalsRead above (not a second,
// diverging set of thresholds), just packaged as one label instead of
// bullet points. P/E is the primary read (PEG only used to break a tie or
// fill in when P/E is unavailable/negative) since PEG needs a real growth
// rate to mean anything and is more often missing. Honest-null: returns
// label:null when neither real number is available, never a guessed verdict.
export function computeValuationVerdict(f) {
  if (!f) return { label: null, reason: null };
  const pe = Number(f.pe ?? f.trailingPE);
  const peg = Number(f.pegRatio);
  const peOk = Number.isFinite(pe) && pe > 0;
  const pegOk = Number.isFinite(peg) && peg > 0;
  if (peOk) {
    if (pe < 15) return { label: "UNDERVALUED", reason: `P/E ${pe.toFixed(1)} — cheap vs. the broad market` };
    if (pe > 50) return { label: "OVERVALUED", reason: `P/E ${pe.toFixed(1)} — expensive, priced for a lot of future growth` };
    if (pegOk && peg < 1) return { label: "UNDERVALUED", reason: `PEG ${peg.toFixed(2)} — cheap relative to its own growth rate` };
    if (pegOk && peg >= 3) return { label: "OVERVALUED", reason: `PEG ${peg.toFixed(2)} — expensive relative to its own growth rate` };
    return { label: "FAIRLY VALUED", reason: `P/E ${pe.toFixed(1)} is a reasonable valuation` };
  }
  if (pegOk) {
    if (peg < 1) return { label: "UNDERVALUED", reason: `PEG ${peg.toFixed(2)} — cheap relative to its own growth rate` };
    if (peg >= 3) return { label: "OVERVALUED", reason: `PEG ${peg.toFixed(2)} — expensive relative to its own growth rate` };
    return { label: "FAIRLY VALUED", reason: `PEG ${peg.toFixed(2)} — fairly priced relative to growth` };
  }
  return { label: null, reason: null };
}

// Reversal Detector — "early get in / early get out" (explicit user request,
// 2026-08-04: "show me early get in and early get out ... when stock
// undervalue and when overvalue like climax"). Ported verbatim (same real
// weights/thresholds) from SmartScanTab.jsx's inline "BOTTOM / TOP DETECTOR"
// — this is the app's existing, already-shipped answer to exactly this
// question, just never surfaced on the Chart page. MACD-cross signals from
// the original are dropped here (that scan-only field isn't available on
// this page's real data) rather than faked with a proxy; every other real
// signal — 52-week range position, RSI, climax RVOL+move, weekly
// reversal-candle, distance from 50-day MA — is unchanged.
export function computeReversalDetector({ price, hi52, lo52, rsi, rvol, dayChangePct, weekChangePct, ma50 }) {
  const px = Number(price);
  if (!Number.isFinite(px) || px <= 0) return null;
  const hi = Number(hi52), lo = Number(lo52);
  const distFromLo = Number.isFinite(hi) && Number.isFinite(lo) && lo > 0 ? (px - lo) / lo * 100 : null;
  const distFromHi = Number.isFinite(hi) && Number.isFinite(lo) && hi > 0 ? (hi - px) / hi * 100 : null;
  const r = Number(rsi), rv = Number(rvol), d1 = Number(dayChangePct), w1 = Number(weekChangePct), ma = Number(ma50);

  const bottomSigs = [], topSigs = [];
  if (distFromLo != null && distFromLo < 10) bottomSigs.push({ txt: `Near 52w low (-${distFromLo.toFixed(1)}%)`, weight: 3 });
  if (Number.isFinite(r) && r < 30) bottomSigs.push({ txt: `RSI oversold (${r.toFixed(0)})`, weight: 3 });
  if (Number.isFinite(r) && Number.isFinite(d1) && r < 40 && d1 > 1) bottomSigs.push({ txt: "RSI recovering + price up", weight: 2 });
  if (Number.isFinite(rv) && Number.isFinite(d1) && rv > 2.5 && d1 < -3) bottomSigs.push({ txt: `Climax sell volume (${rv.toFixed(1)}x) — exhaustion`, weight: 2 });
  if (Number.isFinite(w1) && Number.isFinite(d1) && w1 < -15 && d1 > 0) bottomSigs.push({ txt: "Sharp drop + reversal candle", weight: 2 });
  if (Number.isFinite(ma) && ma > 0 && px < ma * 0.85) bottomSigs.push({ txt: "Far below 50-day MA — stretched", weight: 1 });

  if (distFromHi != null && distFromHi < 5) topSigs.push({ txt: `Near 52w high (-${distFromHi.toFixed(1)}%)`, weight: 3 });
  if (Number.isFinite(r) && r > 70) topSigs.push({ txt: `RSI overbought (${r.toFixed(0)})`, weight: 3 });
  if (Number.isFinite(r) && Number.isFinite(d1) && r > 65 && d1 < -1) topSigs.push({ txt: "RSI dropping + price down", weight: 2 });
  if (Number.isFinite(rv) && Number.isFinite(d1) && rv > 2.5 && d1 > 5) topSigs.push({ txt: `Climax buy volume (${rv.toFixed(1)}x) — exhaustion`, weight: 2 });
  if (Number.isFinite(w1) && Number.isFinite(d1) && w1 > 20 && d1 < 0) topSigs.push({ txt: "Parabolic run + reversal candle", weight: 2 });
  if (Number.isFinite(ma) && ma > 0 && px > ma * 1.20) topSigs.push({ txt: "Far above 50-day MA — extended", weight: 1 });

  const bottomScore = bottomSigs.reduce((s, x) => s + x.weight, 0);
  const topScore = topSigs.reduce((s, x) => s + x.weight, 0);
  const threshold = 2;
  const isBottom = bottomScore >= threshold && bottomScore >= topScore;
  const isTop = topScore >= threshold && topScore > bottomScore;
  const isNeutral = !isBottom && !isTop;
  const verdict = isNeutral ? "MID RANGE"
    : isBottom ? (bottomScore >= 6 ? "LIKELY BOTTOM — early get-in zone" : "POSSIBLE BOTTOM — early get-in zone")
    : (topScore >= 6 ? "LIKELY TOP — early get-out zone" : "POSSIBLE TOP — early get-out zone");
  const sigs = isBottom ? bottomSigs : isTop ? topSigs : [];
  return { verdict, isBottom, isTop, isNeutral, bottomScore, topScore, sigs, distFromLo, distFromHi, hi52: hi, lo52: lo };
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

// Institution Score — options platform redesign Phase 4 (spec: "combine
// Dark Pools, Option Sweeps, Blocks, Open Interest, Call/Put Ratio, 13F
// Filings, Insider Transactions into one Institution Score 0-100" with
// Accumulation/Distribution/Aggressive Buying/Aggressive Selling labels).
// A NEW standalone composite, distinct from computeAiTradeScore (Phase 3)
// — that score uses dark pool/options flow as 2 of 10 general trade-quality
// inputs; this is a dedicated "what is institutional money doing right
// now" read, combining real signals scattered across separate app
// surfaces that were never combined into one score before.
//
// Real 13F-derived institutional position data: confirmed real via
// fetchYahooInstitutional() (src/providers/yahoo.js, already wired to
// GET /api/market/insider's `institutional` field) — each real institution
// row carries a real per-institution share-count `change` since its last
// filing. Real-time ETF flow direction, by contrast, genuinely isn't
// available (Yahoo's fund-ownership data has no `change` field, only a
// snapshot) — the `disclosure` field below says so explicitly rather than
// silently omitting it.
export function computeInstitutionScore({ darkPool, optionsFlow, insiderData, shortInterest } = {}) {
  // Dark pool (0-30) — real block-print notional magnitude (same source/
  // cap as computeAiTradeScore's Dark Pool dimension, reused not re-derived).
  const darkPoolNotional = (darkPool?.prints || []).reduce((s, p) => s + (Number(p.value) || 0), 0);
  const darkPoolPts = darkPool ? Math.round(Math.max(0, Math.min(1, darkPoolNotional / 20_000_000)) * 30) : 15;

  // Options flow (0-25) — real call/put notional skew (same source as
  // computeInstitutionalGrade's Options Flow dimension).
  const callN = Number(optionsFlow?.callNotional), putN = Number(optionsFlow?.putNotional);
  const flowTotal = (Number.isFinite(callN) ? callN : 0) + (Number.isFinite(putN) ? putN : 0);
  const flowRatio = flowTotal > 0 ? callN / flowTotal : null;
  const flowPts = flowRatio != null ? Math.round(flowRatio * 25) : 12;

  // Insider transactions (0-20) — real Form 4 buy-vs-sell dollar notional
  // skew over the real recent transactions list.
  const txns = insiderData?.insiderTransactions?.transactions || [];
  const buyVal = txns.filter(t => t.type === "BUY").reduce((s, t) => s + (Number(t.value) || 0), 0);
  const sellVal = txns.filter(t => t.type === "SELL").reduce((s, t) => s + (Number(t.value) || 0), 0);
  const insiderTotal = buyVal + sellVal;
  const insiderRatio = insiderTotal > 0 ? buyVal / insiderTotal : null;
  const insiderPts = insiderRatio != null ? Math.round(insiderRatio * 20) : 10;

  // 13F-derived institutional position change (0-15) — real net
  // share-count change across the real institutions Yahoo reports,
  // normalized -1..1 (net selling..net buying) then rescaled to 0-15.
  const institutions = insiderData?.institutional?.institutions || [];
  const netChange = institutions.reduce((s, i) => s + (Number(i.change) || 0), 0);
  const totalAbsChange = institutions.reduce((s, i) => s + Math.abs(Number(i.change) || 0), 0);
  const instRatio = totalAbsChange > 0 ? (netChange / totalAbsChange + 1) / 2 : null;
  const instPts = instRatio != null ? Math.round(Math.max(0, Math.min(1, instRatio)) * 15) : 8;

  // Short interest cross-check (0-10) — real shares-short vs. prior month
  // (falling short interest = real covering/accumulation signal, rising =
  // real distribution signal).
  const sharesShort = Number(shortInterest?.sharesShort), sharesShortPrior = Number(shortInterest?.sharesShortPrior);
  const shortChangePct = (Number.isFinite(sharesShort) && Number.isFinite(sharesShortPrior) && sharesShortPrior > 0)
    ? ((sharesShort - sharesShortPrior) / sharesShortPrior) * 100 : null;
  const shortPts = shortChangePct != null ? Math.round(Math.max(0, Math.min(1, (10 - shortChangePct) / 20)) * 10) : 5;

  const breakdown = { darkPoolPts, flowPts, insiderPts, instPts, shortPts };
  const score = Math.max(0, Math.min(100, Object.values(breakdown).reduce((a, b) => a + b, 0)));

  let label;
  if (score >= 80) label = "Aggressive Buying";
  else if (score >= 60) label = "Accumulation";
  else if (score <= 20) label = "Aggressive Selling";
  else if (score <= 40) label = "Distribution";
  else label = "Neutral";

  const reasons = [
    darkPool ? (darkPoolNotional > 0 ? `$${(darkPoolNotional / 1e6).toFixed(1)}M in real dark pool block prints` : "No real block prints above $500K") : "Dark pool data unavailable",
    flowRatio != null ? `Real options flow ${Math.round(flowRatio * 100)}% call-weighted notional` : "Options flow data unavailable",
    insiderTotal > 0 ? `Real insider transactions ${Math.round(insiderRatio * 100)}% buy-weighted ($${(insiderTotal / 1e6).toFixed(1)}M total)` : "No real recent insider transactions",
    institutions.length ? `Real 13F-derived institutional position change: ${netChange >= 0 ? "+" : ""}${netChange.toLocaleString()} shares net across ${institutions.length} reporting institutions` : "No real institutional position-change data",
    shortChangePct != null ? `Real short interest ${shortChangePct >= 0 ? "+" : ""}${shortChangePct.toFixed(1)}% vs. prior month` : "Short interest data unavailable",
  ];

  return {
    score, breakdown, label, reasons,
    disclosure: "Real-time ETF flow data isn't available — not included in this score.",
  };
}

// News Impact Score — News Intelligence layer (2026-08-19, explicit user
// spec). A NEW, standalone sibling score, same pattern as
// computeInstitutionScore/computeAiTradeScore above — never touches
// computeAPlusScore. Consumes the real per-ticker aggregate already
// computed server-side (GET /api/news/ticker/:symbol, src/news/store.js's
// getTickerAggregation — itself built from src/news/scorer.js's real
// catalyst/freshness/source/sentiment/confirmation weighting per article),
// re-expressed here as 4 client-facing dimensions so it plugs into the
// same AiScoreExplainer "why?" modal every other score uses. Honest-null:
// no real recent articles for this symbol returns score: null, never a
// fabricated number.
export function computeNewsImpactScore(tickerAggregation) {
  if (!tickerAggregation || !tickerAggregation.ok || !tickerAggregation.articleCount) {
    return {
      score: null,
      breakdown: { articleVolume: 0, sentimentBalance: 0, latestCatalyst: 0, freshness: 0 },
      label: "No Material News",
      reasons: ["No real recent articles tracked for this symbol.", "—", "—", "—"],
    };
  }
  const { articleCount, bullish, bearish, avgImpact, latestCatalyst, trend, rows } = tickerAggregation;

  // Article volume (0-25) — real recent coverage, capped so one symbol's
  // volume can't dominate the whole 100pt budget on count alone.
  const articleVolume = Math.min(25, Math.round((articleCount / 5) * 25));

  // Sentiment balance (0-25) — how one-sided the real bull/bear split is;
  // a unanimous real read scores higher than a genuinely mixed one.
  const total = bullish + bearish;
  const balanceRatio = total > 0 ? Math.abs(bullish - bearish) / total : 0;
  const sentimentBalance = Math.round(balanceRatio * 25);

  // Latest catalyst (0-25) — direct scaling of the server's own real
  // avgImpact (already a weighted composite of catalyst/freshness/source/
  // sentiment/confirmation per article, src/news/scorer.js), not re-derived.
  const latestCatalystPts = Math.round(((avgImpact || 0) / 100) * 25);

  // Freshness (0-25) — real age of the most recent tracked article.
  const latestAt = rows && rows[0] ? rows[0].received_at : null;
  const ageMin = latestAt ? (Date.now() - new Date(latestAt).getTime()) / 60000 : null;
  const freshness = ageMin == null ? 12 : ageMin <= 60 ? 25 : ageMin <= 240 ? 18 : ageMin <= 1440 ? 10 : 3;

  const breakdown = { articleVolume, sentimentBalance, latestCatalyst: latestCatalystPts, freshness };
  const score = Math.max(0, Math.min(100, Object.values(breakdown).reduce((a, b) => a + b, 0)));
  const label = trend === "BULLISH" ? "Bullish Coverage" : trend === "BEARISH" ? "Bearish Coverage" : "Mixed Coverage";

  const reasons = [
    `${articleCount} real article(s) tracked recently.`,
    `${bullish} bullish vs ${bearish} bearish — ${trend} trend.`,
    latestCatalyst ? `Latest real catalyst: ${latestCatalyst}.` : "No specific catalyst tagged on the latest article.",
    ageMin != null ? `Most recent article ${Math.round(ageMin)} min old.` : "Freshness unavailable.",
  ];

  return { score, breakdown, label, reasons };
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
// Labels retitled from Strong Buy/Buy/Hold/Sell/Strong Sell to quality-
// only words (One Engine Migration Phase 3, 2026-08-23) — see
// src/institutional-scoring.js for the full rationale.
export function institutionalRecommendation(score) {
  if (score >= 85) return { label: "Excellent", stars: 5, color: "#0d9465" };
  if (score >= 70) return { label: "Strong", stars: 4, color: "#22a06b" };
  if (score >= 45) return { label: "Neutral", stars: 3, color: "#d6a312" };
  if (score >= 25) return { label: "Weak", stars: 2, color: "#e07b1a" };
  return { label: "Poor", stars: 1, color: "#c8282a" };
}

// Plain-English translation of real SMC/VWAP/liquidity/trend data — the
// Smart Money page redesign's Section 2 ("Institutional Summary", max 4
// lines, no jargon). Every sentence is a template filled with a real
// already-computed value from /api/market/smart-money's payload; nothing
// here is AI-generated prose. `data` is that endpoint's response shape
// (smc, trend, price, marketContext.session-independent fields).
export function computeInstitutionalSummary(data) {
  if (!data) return [];
  const { smc, trend, price } = data;
  const lines = [];

  const bullOBs = smc?.orderBlocks?.filter((o) => o.type === "BULL_OB").length || 0;
  const bearOBs = smc?.orderBlocks?.filter((o) => o.type === "BEAR_OB").length || 0;
  if (smc?.bos?.type === "BULL_BOS") {
    lines.push(`Bullish structure — price broke above the last swing high${bullOBs >= 2 ? ", with multiple real institutional support zones nearby." : bullOBs === 1 ? ", with a real institutional support zone nearby." : "."}`);
  } else if (smc?.bos?.type === "BEAR_BOS") {
    lines.push(`Bearish structure — price broke below the last swing low${bearOBs >= 1 ? ", with real institutional supply overhead." : "."}`);
  } else if (smc?.choch?.type === "CHOCH_BULL") {
    lines.push("Character of change forming — early real signs of a bullish reversal.");
  } else if (smc?.choch?.type === "CHOCH_BEAR") {
    lines.push("Character of change forming — real trend weakening, watch for a reversal.");
  } else {
    lines.push("No clear real break-of-structure signal right now — price is inside its recent range.");
  }

  const vwap = smc?.vwap20;
  if (vwap != null && price != null) {
    lines.push(price >= vwap ? `Price remains above the 20-day VWAP ($${vwap}).` : `Price remains below the 20-day VWAP ($${vwap}).`);
  } else {
    lines.push("VWAP unavailable (insufficient bar history).");
  }

  const nearestLiq = smc?.liquidity?.[0];
  if (nearestLiq && price != null) {
    lines.push(nearestLiq.price > price
      ? `Liquidity rests above current price near $${nearestLiq.price} (${nearestLiq.label}).`
      : `Liquidity rests below current price near $${nearestLiq.price} (${nearestLiq.label}).`);
  } else {
    lines.push("No real liquidity levels detected nearby.");
  }

  const passCount = trend?.passCount;
  if (passCount != null) {
    lines.push(passCount >= 7 ? `Trend favors continuation (${passCount}/8 real trend criteria pass).`
      : passCount >= 5 ? `Trend is mixed (${passCount}/8 real criteria pass) — wait for more confirmation.`
      : `Trend is unfavorable (${passCount}/8 real criteria pass).`);
  }

  return lines.slice(0, 4);
}

// Merges Order Blocks/FVGs/VWAP/Volume Profile/Liquidity into ONE real
// actionable trade zone (Smart Money page redesign, Section 6). Nearest real
// bullish Order Block wins; falls back to the nearest real bullish Fair
// Value Gap when no OB exists. Stop/Target reuse the exact same real numbers
// already shown in the Trade Plan (`setup`) — never re-derived separately,
// so the two sections can't diverge.
export function computeBestInstitutionalZone(data) {
  if (!data) return null;
  const { smc, price, setup } = data;
  const bullOBs = (smc?.orderBlocks || []).filter((o) => o.type === "BULL_OB");
  const bullFVGs = (smc?.fvgs || []).filter((f) => f.type === "BULL_FVG");
  const nearest = (arr) => arr.length ? arr.reduce((a, b) => Math.abs(b.mid - price) < Math.abs(a.mid - price) ? b : a) : null;

  let zone = null, source = null;
  const ob = nearest(bullOBs);
  if (ob) { zone = { bot: ob.bot, top: ob.top }; source = "Order Block"; }
  else {
    const fvg = nearest(bullFVGs);
    if (fvg) { zone = { bot: fvg.bot, top: fvg.top }; source = "Fair Value Gap"; }
  }

  const vwap = smc?.vwap20;
  const vpoc = smc?.volumeProfile?.vpoc;
  const nearVpoc = vpoc ? Math.abs(price / vpoc - 1) * 100 <= 3 : false;

  return {
    zone, source,
    reasons: [
      { label: "Bullish order block nearby", pass: bullOBs.length > 0 },
      { label: "Bullish fair value gap nearby", pass: bullFVGs.length > 0 },
      { label: "Price above VWAP", pass: vwap != null && price >= vwap },
      { label: "Near volume point of control (VPOC)", pass: nearVpoc },
      { label: "Buyers in control", pass: data.marketControl === "BUYERS" },
    ],
    stop: setup?.stop ?? null,
    target1: setup?.target2 ?? null,
    target2: setup?.target3 ?? null,
  };
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
  // Timing + Breakout Confirmation + VCP Setup Score sub-dimensions, each
  // rescaled proportionally into a 0-100 total (50/38/12 max split, kept
  // from before the 2026-08-14 VCP integration's Trade Setup Score reweight
  // 20/15/5 -> 15/10/15) so the breakdown modal's parts sum to the same
  // scale as the headline score. No cross-function blending — the
  // lowest-risk of the two new derived scores.
  const ab = aPlusScore?.breakdown;
  const timingMax = { entryPts: 50, breakoutPts: 38, vcpPts: 12 };
  const timingBreakdown = ab ? {
    entryPts: Math.round((ab.entryPts / 15) * timingMax.entryPts),
    breakoutPts: Math.round((ab.breakoutPts / 10) * timingMax.breakoutPts),
    vcpPts: Math.round((ab.vcpPts / 15) * timingMax.vcpPts),
  } : null;
  const timingScore = timingBreakdown ? clamp(timingBreakdown.entryPts + timingBreakdown.breakoutPts + timingBreakdown.vcpPts) : null;
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

// Reads the opt-in unifiedDecision/unifiedCriticalFlags fields
// /api/market/trend-screen?...&withDecision=1 attaches server-side (Legacy
// Verdict System migration, 2026-08-23) — the same real pipeline phases
// 5/7/8 already proved (buildEvFromRow -> computeEntryPlan ->
// computeRedFlags -> classifyDeepScanDecision), NOT computeNextAction above
// (that one still reads the old row.verdict/atBuyPoint and has its own much
// wider fan-out — deliberately untouched this phase). The literal decision
// list mirrors watchlist-setup-alerts.js's server-side ACTIONABLE_DECISIONS
// Set — no client-reachable export of that exists (CJS/ESM split, same as
// this file's other cross-runtime constants).
export function isUnifiedGo(row) {
  return row?.unifiedCriticalFlags === 0 &&
    ["BUY", "A_PLUS_EARLY_BUY", "PULLBACK_BUY"].includes(row?.unifiedDecision);
}

// Entry Engine — Green Light AI spec gap (2026-08-03): 5 named entry types
// ("never chase — always prefer buying strength after confirmation or
// quality pullbacks"). Presentation-layer only, zero new computation —
// each type reuses the exact same real fields + boundary conditions the
// Scanner's own Breakout/Pullback/Pre-Pop/Momentum categories already use
// (RhProScanner.jsx CATEGORIES), so this never disagrees with what the
// Scanner itself would call the same row. `aplusScore` is optional (the
// real Trade Setup Score from computeAPlusScore, not present on a raw
// trend-screen row) — Ideal Entry needs it to distinguish "at a confirmed
// breakout" from "at a HIGH-CONVICTION confirmed breakout"; every other
// type works off trend-screen fields alone.
export function classifyEntryType(row, aplusScore) {
  const stage = String(row?.stage || "");
  if (row?.atBuyPoint && row?.volConfirmed && Number(aplusScore) >= 80) {
    return { type: "Ideal Entry", color: "#0d9465", reason: "Confirmed breakout (volume-backed) at a high real Trade Setup Score — the textbook best entry." };
  }
  if (row?.atBuyPoint && row?.volConfirmed) {
    return { type: "Breakout Entry", color: "#22a06b", reason: "Real buy point, confirmed by volume ≥1.4x the 50-day average." };
  }
  if (row?.actionable && !row?.atBuyPoint && !row?.extended && row?.tightening && row?.abovePivotPct != null && row?.abovePivotPct < 0 && row?.abovePivotPct > -5) {
    return { type: "Early Entry", color: "#7c5cff", reason: "Real VCP base contracting, coiled within 5% below the real pivot — before it triggers." };
  }
  if ((row?.rsRating || 0) >= 80 && stage.includes("2")) {
    return { type: "Trend Entry", color: "#2563eb", reason: "RS ≥80 in a confirmed Stage 2 uptrend — buying real established strength." };
  }
  if (row?.actionable && !row?.atBuyPoint && !row?.extended) {
    return { type: "Pullback Entry", color: "#d6a312", reason: "Real actionable setup, not yet at the buy point, not extended — a quality pullback." };
  }
  return null;
}

// Setup Score 0-100 (MTF spec §9, data-integrity/decision-clarity audit,
// 2026-08-20) — "is a tradeable structure forming?", a distinct question
// from Quality Score ("is this a strong stock?"). Deliberately NOT a new
// indicator: this composes row.vcpScore, the real, already-computed VCP
// Report rubric (Trend/Contraction/Volatility/Volume/Breakout, server-
// side vcpReport()) which already measures almost exactly what this spec
// section asks for (tight consolidation, volume/volatility contraction,
// breakout proximity) — plus small adjustments from higherLows/extended/
// actionable, real fields already on the row that vcpReport's own rubric
// doesn't otherwise fold in. When there's no qualifying VCP base at all
// (vcpVerdict === "INVALID VCP"), the raw component sum can still be a
// non-trivial number even though there's no real setup — this floors that
// case to a low score instead, since "no setup" must never read like a
// developing one. Honest null when there's no VCP data at all yet.
// Decision Strength (MTF spec §37/50, 2026-08-20) — explicitly NOT a
// probability (spec's own rule: never present a 0-100 score as a
// statistically calibrated probability unless it's actually been
// validated as one). A composite of how strong/confirmed the CURRENT
// read is across evidence already computed elsewhere — quality, setup,
// MTF alignment, and the A+ Gate's real pass ratio — a weighted average
// of existing real numbers, not a new scoring engine. Honest null when
// nothing is available yet to average.
export function computeDecisionStrength({ qualityScore, setupScore, mtfScore, gatePassRatio } = {}) {
  const parts = [];
  if (Number.isFinite(qualityScore)) parts.push(qualityScore);
  if (Number.isFinite(setupScore)) parts.push(setupScore);
  if (Number.isFinite(mtfScore)) parts.push(mtfScore);
  if (Number.isFinite(gatePassRatio)) parts.push(gatePassRatio * 100);
  if (!parts.length) return null;
  return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
}

// Data Quality + MTF Coverage (MTF spec §22, 2026-08-20) — "never pretend
// full MTF confirmation exists" when timeframes are genuinely unavailable
// (15M/5M today, honestly null rather than fabricated — see the MTF panel
// just above this). Coverage counts real (known) timeframe reads out of
// the total the panel tracks; the 0-100 score blends that coverage with
// whether the Decision Workspace's own core engines (quality/setup/entry)
// actually loaded for this symbol — real inputs, not a new indicator.
export function computeDataQuality(reads, { hasQuality, hasSetup, hasEntry } = {}) {
  const total = Array.isArray(reads) && reads.length ? reads.length : 5;
  const known = Array.isArray(reads) ? reads.filter((r) => r.known).length : 0;
  const coverageRatio = total ? known / total : 0;
  const engineRatio = [hasQuality, hasSetup, hasEntry].filter(Boolean).length / 3;
  const score = Math.round(coverageRatio * 50 + engineRatio * 50);
  return { coverage: `${known}/${total}`, coverageRatio, score };
}

export function computeSetupScore(row) {
  if (!row) return null;
  const vcpScore = Number(row.vcpScore);
  if (!Number.isFinite(vcpScore)) return null;
  if (row.vcpVerdict === "INVALID VCP") return Math.max(0, Math.min(20, Math.round(vcpScore * 0.3)));
  let score = vcpScore;
  if (row.higherLows) score += 5;
  if (row.extended) score -= 15;
  if (row.actionable === false) score -= 10;
  return Math.max(0, Math.min(100, Math.round(score)));
}

// Technical Read (2026-08-20, explicit user request: "TELL ME BASED ON
// TECHNICAL IS IT GOOD OR BAD TRADE OR NEUTRAL SPECIALLY V RECOVERY") —
// the Terminal's TECHNICAL section (RS Rating, Volume, Momentum, ADX,
// Donchian, Bollinger, plus the Foundation/V-Recovery engine) previously
// just listed raw numbers with no synthesis. This rolls them into one
// GOOD/NEUTRAL/WEAK read of the technical/momentum picture specifically —
// a distinct, narrower question from DECISION's BUY/WAIT/AVOID above
// (which gates on the full Minervini trend-template, not these indicators
// alone). Deliberately NOT merged into DECISION's verdict — same "label
// it, don't hide it, don't invent one composite score" discipline as
// Trade Planner's Options Recommendation fix — but designed so a WEAK
// read here explains rather than contradicts a soft DECISION score (e.g.
// low RS/thin volume here is exactly what would also drag the A+ score
// and confidence % shown above it down).
export function computeTechnicalRead({ rsRating, volRatio, momentum, adx, donchian, bollinger, foundation } = {}) {
  const flags = [];
  const num = (v) => (v == null || Number.isNaN(Number(v))) ? null : Number(v);

  const rs = num(rsRating);
  if (rs != null) {
    flags.push({ bull: rs >= 70 ? true : rs < 60 ? false : null, label: `RS Rating ${rs}`,
      detail: rs >= 80 ? "strong relative strength" : rs >= 70 ? "acceptable, at the institutional bar" : "below the 70 institutional bar — soft" });
  }
  const vol = num(volRatio);
  if (vol != null) {
    flags.push({ bull: vol >= 1.0 ? true : vol < 0.5 ? false : null, label: `Volume ${vol.toFixed(2)}×avg`,
      detail: vol >= 1.5 ? "strong conviction behind the move" : vol < 0.5 ? "very thin — little real conviction behind this move" : "roughly average" });
  }
  const mom = num(momentum);
  if (mom != null) {
    flags.push({ bull: mom > 0.5 ? true : mom < -0.5 ? false : null, label: `Momentum ${mom > 0 ? "+" : ""}${mom.toFixed(1)}%`,
      detail: Math.abs(mom) < 0.5 ? "flat" : mom > 0 ? "positive" : "negative" });
  }
  if (adx && adx.strength) {
    const trending = adx.strength === "Strong";
    flags.push({ bull: trending ? adx.direction === "Bullish" : null, label: `ADX ${adx.adx} (${adx.strength})`,
      detail: trending ? `real ${String(adx.direction).toLowerCase()} trend` : "no real trend — range-bound/choppy" });
  }
  if (donchian && donchian.pctPosition != null) {
    const p = donchian.pctPosition;
    flags.push({ bull: p >= 80 ? true : p <= 20 ? false : null, label: `${p}% of 20d range`,
      detail: p >= 90 ? "near range highs" : p <= 10 ? "near range lows" : "mid-range" });
  }
  if (bollinger && bollinger.percentB != null) {
    const b = bollinger.percentB;
    flags.push({ bull: b >= 80 ? true : b <= 20 ? false : null, label: `Bollinger %B ${b}%`,
      detail: b >= 100 ? "above the upper band" : b <= 0 ? "below the lower band" : "inside the bands" });
  }

  // V-Recovery/Foundation is reported but deliberately NOT scored into the
  // bull/bear count above when it isn't in play (recoveryType === "NONE")
  // — most stocks aren't recovering from a real prior decline, and that's
  // neutral information, not a bearish signal. When it IS in play, its
  // verdict genuinely is real signal, so it counts.
  let vRecovery = { inPlay: false, note: "No V-Recovery pattern in play — this engine only reads stocks recovering from a real, meaningful prior decline." };
  if (foundation && foundation.dataInsufficient) {
    vRecovery = { inPlay: false, note: `V-Recovery: not enough price history yet (${foundation.reason || "insufficient data"}).` };
  } else if (foundation && foundation.recoveryType === "NONE") {
    vRecovery = { inPlay: false, note: "No V-Recovery pattern in play — this engine only reads stocks recovering from a real, meaningful prior decline." };
  } else if (foundation && foundation.verdict) {
    const state = foundation.verdict.state || "—";
    vRecovery = { inPlay: true, note: `V-Recovery in play — Foundation reads ${state} (${foundation.foundationScore}/100).` };
    const strong = state === "STRONG_FOUNDATION_VALID_PIVOT" || state === "STRONG_FOUNDATION";
    const weak = state === "WEAK_FOUNDATION";
    flags.push({ bull: strong ? true : weak ? false : null, label: `Foundation ${state}`, detail: vRecovery.note });
  }

  const known = flags.filter(f => f.bull !== null);
  const bullCount = known.filter(f => f.bull).length;
  const bearCount = known.filter(f => !f.bull).length;

  let verdict, color;
  if (!known.length) { verdict = "NOT ENOUGH DATA"; color = "#94a3b8"; }
  else if (bullCount >= bearCount + 2) { verdict = "GOOD"; color = "#22d47e"; }
  else if (bearCount >= bullCount + 2) { verdict = "WEAK"; color = "#ef4444"; }
  else { verdict = "NEUTRAL"; color = "#d6a312"; }

  return { verdict, color, flags, vRecovery, bullCount, bearCount, knownCount: known.length };
}
