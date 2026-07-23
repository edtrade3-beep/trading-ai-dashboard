// advisor-ai.js — ADVISOR AI: a long-horizon CIO-style research brief.
//
// Same architecture as ceo-ai.js — one real synthesis call over data this
// app already has, not a live institutional-data terminal. The user's own
// spec for this feature assumed real-time 13F filings, Congress trading,
// patent-filing databases, and CEO earnings-call transcripts — none of
// which this platform has access to (those are separate paid data feeds).
// Rather than fabricate those numbers, this explicitly tells Claude to
// either omit them or lean on real web_search results (cited), and to
// build every stock-specific claim from the real data gathered below.
//
// Structured JSON output (not free text): Claude's job is to SELECT symbols
// from the real A+ setups list and explain why — never to type out numbers.
// Every entry/stop/target/score/RS shown to the user is re-attached
// server-side from the real trend-screen scan after Claude responds, so a
// hallucinated number can never reach the UI even if the model tried.
const { callAnthropicWithSearch } = require("./anthropic");
const { getMode } = require("./credit-saver-mode");
const { saveCoachOutput, loadCoachLog } = require("./ai-coach-store");
const { loadHistory, appendSnapshot, snapshotDaysAgo } = require("./advisor-history-store");
const { PORT } = require("./config");
const { sectorOf } = require("./risk-guardrails");

const KEY = () => (process.env.ANTHROPIC_API_KEY || "").trim();
const BASE = () => process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;
async function getJson(path) {
  try { const r = await fetch(`${BASE()}${path}`); return await r.json(); } catch { return null; }
}

// Same 11 real sector ETFs, now sourced from sector-theme-map.js (the one
// canonical table — this file previously hand-rolled its own copy, along
// with routes/market.js and risk-guardrails.js each doing the same).
// Re-shaped to {symbol,name} to match this file's existing downstream
// `.symbol` references rather than touching every call site.
const { SECTOR_ETFS: CANONICAL_SECTOR_ETFS } = require("./sector-theme-map");
const SECTOR_ETFS = CANONICAL_SECTOR_ETFS.map((s) => ({ symbol: s.sym, name: s.name }));

// Capital Flow Engine's non-sector asset classes — all four are already
// fetched below as part of the existing macro quote call (SPY, QQQ, IWM,
// VIXY, UUP, GLD, USO, TLT, HYG, IBIT), just never surfaced as a ranked
// "where's money flowing" category before. AI/Semiconductors-specific and
// International Markets/Cash are deliberately NOT included — there's no
// real ETF for those already in the fetched set, and adding new fetches
// just to fill out the spec's full category list would stop this being a
// same-data extension. Flagged as a gap, not silently invented.
const MACRO_ASSET_CLASSES = [
  { symbol: "IBIT", name: "Crypto" },
  { symbol: "GLD",  name: "Precious Metals" },
  { symbol: "TLT",  name: "Treasuries" },
  { symbol: "HYG",  name: "Credit" },
];

// Broad, liquid, sector-diverse universe — expanded per user request for
// "more stocks" (was 50 names, tech/mega-cap heavy). Same liquid-cap
// pattern other real-time scanners in this app use (gap-scan.js's
// GAP_UNIVERSE, RH_UNIVERSE), just wider: mega-cap tech, semis, defense,
// energy majors, financials, biotech/pharma, industrials, nuclear/quantum
// future-tech names (matching ADVISOR's own 5-year-thesis framing),
// fintech, and high-momentum small/mid-caps. Capped by trend-screen's own
// route limit (90 symbols).
const SCAN_UNIVERSE = [
  // Mega-cap tech / AI infrastructure
  "AAPL","MSFT","NVDA","AMZN","META","GOOGL","AVGO","TSLA","AMD","NFLX",
  "CRM","ORCL","ADBE","NOW","PANW","CRWD","PLTR","SNOW","MU","QCOM",
  "ANET","MRVL","SMCI","ARM","LRCX","TSM","INTC","TXN","ON","KLAC",
  // Cybersecurity / cloud / software
  "NET","DDOG","ZS","APP","FTNT","S","TEAM","WDAY",
  // Fintech / financials
  "COIN","HOOD","V","MA","JPM","GS","MS","BLK","SCHW","SOFI",
  // Consumer / retail
  "COST","HD","NKE","SBUX","UBER","ABNB","SHOP","LULU",
  // Industrials / defense / government exposure
  "CAT","LMT","RTX","NOC","GE","BA","DE",
  // Energy / power / nuclear
  "XOM","CVX","OXY","VRT","NEE","CCJ","CEG","SMR","OKLO",
  // Healthcare / biotech
  "LLY","UNH","ISRG","REGN","VRTX",
  // Momentum / small-mid cap
  "DELL","MARA","RIOT","RKLB","ASTS","IONQ","SOUN",
];

function relStrength(sd, spyChg) {
  return Number((sd?.changesPercentage ?? 0) - spyChg);
}

const row2 = (n) => Math.round(Number(n) * 100) / 100;
const fmt0 = (n) => Number.isFinite(Number(n)) ? Math.round(Number(n)).toLocaleString("en-US") : "—";

// Market Scenario Engine — grounded in the exact same real 5-factor system
// computeRegime already uses (SPY up, QQQ up, VIX<20, breadth+, trend day;
// GREEN >=75, YELLOW >=55, else RED), not a separate invented model. The
// probabilities are a deliberately simple, transparent function of today's
// real score's distance from those real thresholds — explicitly labeled as
// illustrative, not a calibrated statistical forecast, since this app has
// no real historical hit-rate data to calibrate against.
function buildScenarios(regime) {
  const score = regime.score;
  const bullProb = Math.max(5, Math.min(85, Math.round(score * 0.85)));
  const bearProb = Math.max(5, Math.min(85, Math.round((100 - score) * 0.85)));
  const baseProb = Math.max(5, 100 - bullProb - bearProb);
  return {
    best: { label: "Best case", probability: bullProb,
      desc: "Regime confirms GREEN (score ≥75): SPY and QQQ both trending up, VIX under 20, breadth positive." },
    base: { label: "Base case", probability: baseProb,
      desc: `Regime holds near today's read — ${regime.label} (${score}/100) — without a clean confirmation either direction.` },
    worst: { label: "Worst case", probability: bearProb,
      desc: "Regime confirms RED (score ≤40): VIX spikes above 20 with SPY and QQQ both breaking down and breadth deteriorating." },
    shiftConditions: [
      "Turns more bullish if SPY/QQQ both trend up, VIX falls under 20, and breadth turns positive — the same real factors computeRegime already checks daily.",
      "Turns more bearish if VIX spikes above 20 while SPY/QQQ both roll over and breadth deteriorates.",
    ],
  };
}

// Market Regime Engine, widened — computeRegime already returns a real
// `factors` array (which of the 5 real checks passed/failed) and a real
// `vixVal` (the actual VIX level, not just the <20 boolean it's reduced to
// for the 3-bucket score), neither of which was ever surfaced beyond the
// GREEN/YELLOW/RED label. This adds a finer real state purely by combining
// those two already-computed real reads — no new fetch, no new model, and
// the underlying GREEN/YELLOW/RED contract other code (computeAPlusScore,
// the regime pill color) depends on is untouched. VIX's magnitude only
// really supports 4 honest buckets (not a spuriously precise scale), so
// this yields ~7-8 real combined states, not a padded-out 11 — a state this
// data can't actually distinguish isn't invented just to hit a count.
function classifyVolRegime(vixVal) {
  if (!Number.isFinite(vixVal) || vixVal <= 0) return null;
  if (vixVal < 13) return "Low";
  if (vixVal < 20) return "Normal";
  if (vixVal < 30) return "Elevated";
  return "Panic";
}

function buildRegimeDetail(regime) {
  const factorsPassed = (regime.factors || []).filter(f => f.pass).map(f => f.label);
  const factorsFailed = (regime.factors || []).filter(f => !f.pass).map(f => f.label);
  const volRegime = classifyVolRegime(regime.vixVal);
  let state;
  if (regime.label === "GREEN" && volRegime === "Low") state = "Strong Bull — Low Volatility";
  else if (regime.label === "GREEN" && (volRegime === "Elevated" || volRegime === "Panic")) state = "Bull — Volatility Divergence";
  else if (regime.label === "GREEN") state = "Bull";
  else if (regime.label === "YELLOW" && (volRegime === "Elevated" || volRegime === "Panic")) state = "Choppy — Volatility Rising";
  else if (regime.label === "YELLOW") state = "Choppy / Transitional";
  else if (regime.label === "RED" && volRegime === "Panic") state = "Bear — Panic/Capitulation";
  else if (regime.label === "RED" && volRegime === "Elevated") state = "Bear — Elevated Volatility";
  else if (regime.label === "RED") state = "Bear — Orderly Decline";
  else state = regime.label; // VIX unavailable this run — fall back to the real 3-bucket label rather than guess a volatility state
  return { state, volRegime, vixVal: Number.isFinite(regime.vixVal) ? row2(regime.vixVal) : null, factorsPassed, factorsFailed };
}

// AI Confidence Engine — the spec's 14-named-score composite, reduced to
// the honest subset this app can back with real data: technical (this
// platform's own real A+ trend-template score), fundamental (a transparent,
// simple point score over real growth/margin/valuation/leverage fields —
// not a professional quant model, just a disclosed heuristic), smart-money
// (a real, symbol-specific check against today's real insider Form 4 buys
// and real short-interest changes — not the market-wide narrative, an
// actual match on THIS symbol), and portfolio-fit (real: does this
// symbol's real sector — the exact sectorOf() classification already
// backing Risk Command Center's sectorConcentration — already have real
// concentration in the real live portfolio). The remaining 10 named scores
// in the spec (institutional positioning, execution quality, catalyst
// timing, sentiment, etc.) have no real quantifiable source anywhere in
// this app. Any sub-score with no real supporting data is null, never a
// guessed neutral value, and the composite only averages the sub-scores
// that actually resolved — so a stock with only a technical read isn't
// penalized (or flattered) by pretending the others are neutral.
const CONFIDENCE_NOT_COVERED = ["Institutional positioning (name-specific)", "Execution quality", "Catalyst timing", "Sentiment"];

function computeFundamentalScore(f) {
  if (!f) return null;
  const checks = [];
  if (Number.isFinite(f.revenueGrowth)) checks.push(f.revenueGrowth >= 0.20 ? 20 : f.revenueGrowth >= 0.10 ? 14 : f.revenueGrowth >= 0 ? 8 : 0);
  if (Number.isFinite(f.earningsGrowth)) checks.push(f.earningsGrowth >= 0.20 ? 20 : f.earningsGrowth >= 0.10 ? 14 : f.earningsGrowth >= 0 ? 8 : 0);
  if (Number.isFinite(f.pegRatio) && f.pegRatio > 0) checks.push(f.pegRatio < 1 ? 20 : f.pegRatio < 2 ? 14 : f.pegRatio < 3 ? 8 : 0);
  if (Number.isFinite(f.profitMargin)) checks.push(f.profitMargin >= 0.20 ? 20 : f.profitMargin >= 0.10 ? 14 : f.profitMargin >= 0 ? 8 : 0);
  if (Number.isFinite(f.debtToEquity)) checks.push(f.debtToEquity < 50 ? 20 : f.debtToEquity < 100 ? 14 : f.debtToEquity < 200 ? 8 : 0);
  if (!checks.length) return null;
  return Math.round((checks.reduce((s, v) => s + v, 0) / checks.length) * 5); // each check maxes at 20 -> scale to /100
}

function computeSmartMoneyScore(symbol, insider, shortChg) {
  const insiderBuy = !!(insider?.ok && (insider.results || []).some(r => (r.ticker || r.symbol) === symbol));
  const shortCovering = !!(shortChg?.ok && (shortChg.covering || []).some(s => s.sym === symbol));
  const shortIncreasing = !!(shortChg?.ok && (shortChg.increasing || []).some(s => s.sym === symbol));
  if (!insiderBuy && !shortCovering && !shortIncreasing) return null; // no real signal for THIS symbol — not "neutral", just unknown
  let score = 50;
  if (insiderBuy) score += 25;
  if (shortCovering) score += 15;
  if (shortIncreasing) score -= 25;
  return Math.max(0, Math.min(100, score));
}

// Fewer real existing holdings in this real sector = better real
// diversification fit. Requires a real connected portfolio (sectorConcentration
// comes from the real live account) — with no portfolio there's no real
// book to assess fit against, so this stays null rather than assuming
// "no portfolio" means "no concentration".
function computeFitScore(symbol, sectorConcentration) {
  if (!sectorConcentration) return null;
  const count = sectorConcentration[sectorOf(symbol)] || 0;
  if (count === 0) return 100;
  if (count === 1) return 75;
  if (count === 2) return 50;
  return 25;
}

function computeConfidence(r, insider, shortChg, sectorConcentration) {
  const technical = Number.isFinite(r?.aplus?.score) ? r.aplus.score : null;
  const fundamental = computeFundamentalScore(r.fund);
  const smartMoney = computeSmartMoneyScore(r.symbol, insider, shortChg);
  const portfolioFit = computeFitScore(r.symbol, sectorConcentration);
  const parts = [["technical", technical], ["fundamental", fundamental], ["smartMoney", smartMoney], ["portfolioFit", portfolioFit]].filter(([, v]) => v != null);
  if (!parts.length) return null;
  return {
    composite: Math.round(parts.reduce((s, [, v]) => s + v, 0) / parts.length),
    technical, fundamental, smartMoney, portfolioFit,
    basedOn: parts.map(([k]) => k),
    notCovered: CONFIDENCE_NOT_COVERED,
  };
}

// Attach real, server-computed numbers to an AI-selected symbol. Never
// trust anything numeric the model typed — if the symbol isn't in the real
// ranked-setups map, drop it rather than show a pick with fabricated data.
function attachRealData(pick, rankedMap) {
  const row = rankedMap.get(String(pick?.symbol || "").toUpperCase());
  if (!row) return null;
  const f = row.fund || null;
  return {
    symbol: row.symbol,
    why: String(pick.why || "").slice(0, 240),
    score: row.aplus.score,
    action: row.next.action,
    actionReason: row.next.reason,
    rsRating: row.rsRating,
    passCount: row.passCount,
    stage: (row.stage || "").replace(/ —.*/, ""),
    entry: row.entry,
    stop: row.stop,
    target: row.target2,
    // target3, breakoutEntry, and pullbackEntry are computed from the real
    // entry/stop pair above, not independently fetched — confirmed live
    // that trend-screen's entry/stop/target2 already sit on a clean, exact
    // 2:1 reward:risk ratio (verified against 3 real symbols), so target3
    // extends that same real progression to 3:1 rather than guessing a
    // number. breakoutEntry/pullbackEntry are real trade-management levels
    // derived from the real pivot/stop distance (same 0.5%-buffer and
    // partial-retracement conventions already used elsewhere in this
    // session for TradeAdvisorTab/EarlyEntryScanner), not a second real
    // data source — labeled as computed, not fetched.
    target3: row2(row.entry + (row.entry - row.stop) * 3),
    breakoutEntry: row2(row.entry * 1.005),
    pullbackEntry: row2(row.entry - (row.entry - row.stop) * 0.3),
    atBuyPoint: !!row.atBuyPoint,
    // Real fundamentals from /api/yahoo/fundamentals — null fields where
    // Yahoo doesn't have the data, never a guessed/interpolated value.
    // marketCap specifically needs a `> 0` guard (not just isFinite): when
    // fetchYahooFundamentals's primary lookup fails, its own fallback path
    // computes cap from a second live-quote call, and if THAT also comes up
    // empty it defaults to a literal 0 — confirmed live (a transient Yahoo
    // hiccup returned marketCap:0 for AMD, a real ~$800B company, in one
    // production run). 0 is never a legitimate market cap for any real
    // listed company, so treat it the same as missing data.
    fundamentals: f ? {
      marketCap: Number.isFinite(f.marketCap) && f.marketCap > 0 ? f.marketCap : null,
      pe: Number.isFinite(f.pe) ? f.pe : null,
      pegRatio: Number.isFinite(f.pegRatio) ? f.pegRatio : null,
      revenueGrowth: Number.isFinite(f.revenueGrowth) ? f.revenueGrowth : null,
      earningsGrowth: Number.isFinite(f.earningsGrowth) ? f.earningsGrowth : null,
      grossMargin: Number.isFinite(f.grossMargin) ? f.grossMargin : null,
      profitMargin: Number.isFinite(f.profitMargin) ? f.profitMargin : null,
      debtToEquity: Number.isFinite(f.debtToEquity) ? f.debtToEquity : null,
      freeCashflow: Number.isFinite(f.freeCashflow) ? f.freeCashflow : null,
    } : null,
    // Bear/base/bull proxy from real Wall Street analyst price targets —
    // not AI-generated scenario modeling. targetLow/Mean/HighPrice and the
    // analyst count are genuine data from Yahoo's recommendationTrend/
    // financialData modules, not an invented probability distribution.
    priceTargets: f && (Number.isFinite(f.targetLowPrice) || Number.isFinite(f.targetMeanPrice) || Number.isFinite(f.targetHighPrice)) ? {
      bear: Number.isFinite(f.targetLowPrice) ? f.targetLowPrice : null,
      base: Number.isFinite(f.targetMeanPrice) ? f.targetMeanPrice : null,
      bull: Number.isFinite(f.targetHighPrice) ? f.targetHighPrice : null,
      recommendation: f.recommendationKey || null,
      analystCount: Number.isFinite(f.numberOfAnalystOpinions) ? f.numberOfAnalystOpinions : null,
    } : null,
    confidence: row.confidence || null,
  };
}

// Real, deterministic fallback for actionPlan when the AI call is
// unavailable — reuses this platform's own already-computed
// computeNextAction (trend-template stage/verdict/volume-confirmation
// logic, no AI involved) instead of returning nothing. Command Center's
// topOpportunities/topRisks derive from actionPlan, so this is what keeps
// its real trade cards populated during an AI outage too, not just this
// brief's own display.
function buildFallbackActionPlan(ranked, portfolio) {
  const nextToAction = { BUY: "BUY_NOW", BREAKOUT: "WATCH", WATCH: "WATCH", WAIT: "WAIT", AVOID: "AVOID" };
  const fromScan = ranked
    .filter((r) => ["BUY", "BREAKOUT", "WATCH"].includes(r.next.action))
    .slice(0, 10)
    .map((r) => ({ symbol: r.symbol, action: nextToAction[r.next.action], reason: r.next.reason, score: r.aplus.score, confidence: r.confidence || null, held: false }));

  // Real concentration-risk flag on holdings over 20% of equity — the same
  // maxNamePct convention already used elsewhere in this app's real
  // position sizing (risk-guardrails.js), not a fabricated portfolio call.
  const fromPortfolio = (portfolio?.holdings || [])
    .filter((h) => h.weightPct > 20)
    .map((h) => ({ symbol: h.symbol, action: "REDUCE", reason: `Concentration risk — ${h.weightPct}% of portfolio equity (>20% threshold).`, held: true, weightPct: h.weightPct, unrealizedPLpc: h.unrealizedPLpc }));

  return [...fromPortfolio, ...fromScan].slice(0, 12);
}

async function buildAdvisorBrief() {
  if (!KEY()) return null;

  const [macroRows, sectorRows, screen, insider, cot, shortChg, news, positions, riskSnap] = await Promise.all([
    getJson("/api/market/quote?symbols=SPY,QQQ,IWM,VIXY,UUP,GLD,USO,TLT,HYG,IBIT"),
    getJson(`/api/market/quote?symbols=${SECTOR_ETFS.map(s => s.symbol).join(",")}`),
    getJson(`/api/market/trend-screen?symbols=${SCAN_UNIVERSE.join(",")}`),
    getJson("/api/scanner/insider"),
    getJson("/api/cot/status"),
    getJson("/api/market/short-changes"),
    getJson("/api/market/news?tickers=SPY,QQQ,NVDA,AAPL,MSFT,TSLA,AMD,META&limit=12"),
    // Portfolio Manager section — both already real, already-tested
    // endpoints: /api/alpaca/positions (real per-holding qty/avgEntry/
    // marketValue/unrealizedPL) and /api/ai-hub/risk-snapshot (the exact
    // risk-guardrails.js math that already gates the autopilots — real
    // equity/cash/openRiskPct/sectorConcentration/dailyBreakerTripped).
    // No new risk math or sector map needed; both were already built for
    // PortfolioRiskCard.jsx, just never pulled into this brief.
    getJson("/api/alpaca/positions"),
    getJson("/api/ai-hub/risk-snapshot"),
  ]);

  const { computeRegime, computeAPlusScore, computeNextAction } = require("./trade-planner-scoring");
  const macroArr = Array.isArray(macroRows) ? macroRows : [];
  const regime = computeRegime(macroArr);
  const regimeDetail = buildRegimeDetail(regime);
  const spy = macroArr.find(m => m.symbol === "SPY");
  const spyChg = Number(spy?.changesPercentage || 0);
  const scenarios = buildScenarios(regime);

  // Real sector rankings — relative strength vs SPY today, same value-based
  // math RotationTab uses. Sent to the UI as real structured data directly
  // (not re-summarized by the model) — this is math the platform already
  // computes correctly, so there's no reason to let an LLM restate it.
  const sectorArr = Array.isArray(sectorRows) ? sectorRows : [];
  const sectors = SECTOR_ETFS.map(se => {
    const sd = sectorArr.find(x => x.symbol === se.symbol);
    return { name: se.name, symbol: se.symbol, chg: Number(sd?.changesPercentage || 0), rel: relStrength(sd, spyChg) };
  }).filter(s => Number.isFinite(s.chg)).sort((a, b) => b.rel - a.rel);

  // Capital Flow Engine — same real relative-strength math as `sectors`
  // above, widened with the macro asset classes already fetched in
  // macroRows (crypto/gold/treasuries/credit), so "where's money flowing"
  // covers more than just equity sectors without any new fetch. Feeds the
  // prompt below directly (superset of what sectorLines used to show).
  const capitalFlow = [...sectors, ...MACRO_ASSET_CLASSES.map(mc => {
    const sd = macroArr.find(x => x.symbol === mc.symbol);
    return { name: mc.name, symbol: mc.symbol, chg: Number(sd?.changesPercentage || 0), rel: relStrength(sd, spyChg) };
  }).filter(s => Number.isFinite(s.chg))].sort((a, b) => b.rel - a.rel);
  const capitalFlowLines = capitalFlow.map(s => `${s.name} (${s.symbol}): ${s.chg >= 0 ? "+" : ""}${s.chg.toFixed(2)}% today, ${s.rel >= 0 ? "+" : ""}${s.rel.toFixed(2)}% vs SPY`).join("\n");

  // What Changed? — real day/week/month/quarter comparisons. ai-coach-log.json
  // only ever kept the latest brief per report type (overwritten each run),
  // so there was no real history anywhere to diff against before this —
  // advisor-history-store.js is a new, dedicated rolling snapshot store
  // (real regime score + capital-flow leaders/laggards + portfolio state,
  // one entry per calendar day). Deltas are computed from real past
  // snapshots only; any horizon with no data that far back is honestly
  // null (e.g. every quarter/month comparison on day 1 of this feature
  // existing), never guessed or interpolated.
  const historyDays = loadHistory();
  const buildDelta = (label, snap) => {
    if (!snap) return null;
    return {
      label, asOf: snap.date,
      regimeScoreThen: snap.regimeScore, regimeScoreDelta: row2(regime.score - snap.regimeScore),
      spyChgThen: snap.spyChg,
      topFlowThen: snap.topFlow || [], bottomFlowThen: snap.bottomFlow || [],
      portfolioEquityThen: snap.portfolioEquity ?? null,
    };
  };
  const whatChanged = {
    vsYesterday: buildDelta("yesterday", snapshotDaysAgo(historyDays, 1)),
    vsLastWeek: buildDelta("last week", snapshotDaysAgo(historyDays, 7)),
    vsLastMonth: buildDelta("last month", snapshotDaysAgo(historyDays, 30)),
    vsLastQuarter: buildDelta("last quarter", snapshotDaysAgo(historyDays, 90)),
  };
  const whatChangedLines = Object.values(whatChanged).filter(Boolean).map(d =>
    `${d.label} (${d.asOf}): regime was ${d.regimeScoreThen}/100 (now ${regime.score}/100, ${d.regimeScoreDelta >= 0 ? "+" : ""}${d.regimeScoreDelta}), SPY was ${d.spyChgThen >= 0 ? "+" : ""}${d.spyChgThen}% that day, leaders then: ${(d.topFlowThen || []).map(f => f.name).join(", ") || "n/a"}, laggards then: ${(d.bottomFlowThen || []).map(f => f.name).join(", ") || "n/a"}.`
  ).join("\n") || "No prior snapshots yet — this history builds up starting today, so day/week/month/quarter comparisons aren't available until the corresponding time has actually passed.";

  // Real A+ setups from the platform's own trend-template + A+ Score engine
  // (same formula used everywhere else in this app: TopOpportunityCard,
  // RhProScanner, Trading Copilot's setups context). Widened from top-12 to
  // top-25 so the model has real room to pick multiple names per horizon
  // instead of being forced into one.
  const screenResults = (screen?.results || []).filter(r => !r.error && Number(r.entry) > Number(r.stop));
  const scoredAll = screenResults.map(r => ({ ...r, aplus: computeAPlusScore(r, regime), next: computeNextAction(r) }));
  const ranked = [...scoredAll].sort((a, b) => b.aplus.score - a.aplus.score).slice(0, 25);

  // AI Avoid List — the bottom of the same real, already-scored scan, with
  // real reasons pulled from real fields (RS rating, trend-template pass
  // count, extended flag, stage) — not a second scoring pass, just the
  // other end of the list already computed above.
  const avoidList = [...scoredAll].sort((a, b) => a.aplus.score - b.aplus.score).slice(0, 8).map(r => {
    const reasons = [];
    if (Number(r.rsRating || 0) < 50) reasons.push(`weak relative strength (RS ${r.rsRating})`);
    if (Number(r.passCount || 0) < 4) reasons.push(`only ${r.passCount}/8 trend-template criteria met`);
    if (r.extended) reasons.push("technically extended");
    const stage = String(r.stage || "");
    if (stage.startsWith("Stage 4")) reasons.push("Stage 4 downtrend");
    else if (stage.startsWith("Stage 3")) reasons.push("Stage 3 distribution/topping");
    return { symbol: r.symbol, score: r.aplus.score, stage: stage.replace(/ —.*/, ""), reasons: reasons.length ? reasons : ["low composite score"] };
  });

  // Portfolio Manager — entirely real, already-computed data from two
  // endpoints this session's audit confirmed live: /api/alpaca/positions
  // (per-holding qty/avgEntry/current/marketValue/unrealizedPL) and
  // /api/ai-hub/risk-snapshot (equity/cash/openRiskPct/sectorConcentration/
  // dailyBreakerTripped — the exact math already gating the autopilots).
  // No new risk logic or sector map — this is the same real data
  // PortfolioRiskCard.jsx already renders, just folded into this brief too
  // so ADVISOR's picks can be read alongside real current exposure.
  // Computed here (before the prompt is built) since portfolioLines below
  // needs it — was previously placed after the AI call by mistake, causing
  // a "Cannot access 'portfolio' before initialization" crash on every run
  // (caught live: the very first real end-to-end test of this build).
  const posArr = Array.isArray(positions?.positions) ? positions.positions : [];
  const totalMv = posArr.reduce((s, p) => s + Number(p.marketValue || 0), 0);
  const holdings = posArr.map(p => ({
    symbol: p.symbol, qty: Number(p.qty || 0), avgEntry: Number(p.avgEntry || 0),
    current: Number(p.current || 0), marketValue: Number(p.marketValue || 0),
    unrealizedPL: Number(p.unrealizedPL || 0), unrealizedPLpc: Number(p.unrealizedPLpc || 0),
    weightPct: totalMv > 0 ? row2((Number(p.marketValue || 0) / totalMv) * 100) : 0,
  })).sort((a, b) => b.marketValue - a.marketValue);

  // Real per-holding volatility (beta) for the Risk Command Center below.
  // Same /api/yahoo/fundamentals endpoint the ranked setups use, fetched
  // separately here since a real holding isn't guaranteed to be inside
  // SCAN_UNIVERSE (confirmed: a real test holding, OKTA, wasn't) — bounded
  // to the real holdings list (typically well under 20 positions), same
  // bounded-fan-out pattern used everywhere else in this file.
  const holdingFund = await Promise.all(holdings.map(h => getJson(`/api/yahoo/fundamentals?symbol=${h.symbol}`)));
  holdings.forEach((h, i) => { h.beta = Number.isFinite(holdingFund[i]?.beta) ? holdingFund[i].beta : null; });
  const betaKnown = holdings.filter(h => h.beta != null && totalMv > 0);
  const weightedBetaDenom = betaKnown.reduce((s, h) => s + h.weightPct, 0);
  const weightedBeta = betaKnown.length && weightedBetaDenom > 0
    ? row2(betaKnown.reduce((s, h) => s + h.beta * h.weightPct, 0) / weightedBetaDenom)
    : null;

  const portfolio = (riskSnap?.ok || holdings.length) ? {
    equity: Number(riskSnap?.equity ?? null),
    cash: Number(riskSnap?.cash ?? null),
    buyingPower: Number(riskSnap?.buyingPower ?? null),
    openRiskPct: Number(riskSnap?.openRiskPct ?? null),
    dailyBreakerTripped: !!riskSnap?.dailyBreakerTripped,
    accountHealthy: riskSnap?.accountHealth?.ok !== false,
    positionCount: holdings.length,
    sectorConcentration: riskSnap?.sectorConcentration || null,
    topHoldingWeightPct: holdings[0]?.weightPct ?? null,
    top3WeightPct: row2(holdings.slice(0, 3).reduce((s, h) => s + h.weightPct, 0)),
    totalUnrealizedPL: row2(posArr.reduce((s, p) => s + Number(p.unrealizedPL || 0), 0)),
    holdings: holdings.slice(0, 20),
  } : null;

  // Real market-wide risk reads pulled from real quotes already fetched
  // above (HYG/TLT already in capitalFlow, UUP already in macroArr) — no
  // new fetch. HYG (high-yield credit ETF) selling off is a real
  // credit-spread-widening signal; TLT (20+yr Treasuries) selling off
  // sharply is a real sign of a fast rate move; UUP (dollar index) is a
  // real currency-strength read. These are single-day % moves, not a
  // proper credit-spread/yield-curve calculation, so they're reported as
  // "elevated/watch/normal today" signals, not a calibrated risk score —
  // same honesty standard as the rest of this file. Market-wide, so
  // available even when no live portfolio is connected.
  const hygEntry = capitalFlow.find(s => s.symbol === "HYG");
  const tltEntry = capitalFlow.find(s => s.symbol === "TLT");
  const uupEntry = macroArr.find(m => m.symbol === "UUP");
  const hygChg = hygEntry ? hygEntry.chg : null;
  const tltChg = tltEntry ? tltEntry.chg : null;
  const uupChg = Number.isFinite(Number(uupEntry?.changesPercentage)) ? row2(Number(uupEntry.changesPercentage)) : null;
  const creditRisk = hygChg == null ? null : hygChg <= -0.5 ? "ELEVATED" : hygChg <= -0.2 ? "WATCH" : "NORMAL";
  const currencyRisk = uupChg == null ? null : Math.abs(uupChg) >= 0.5 ? "ELEVATED" : Math.abs(uupChg) >= 0.25 ? "WATCH" : "NORMAL";
  const interestRateRisk = tltChg == null ? null : tltChg <= -0.7 ? "ELEVATED" : tltChg <= -0.35 ? "WATCH" : "NORMAL";

  // Risk Command Center — only the risk types this app can honestly
  // quantify from real data: concentration (real position weights),
  // volatility (real portfolio-weighted beta from Yahoo fundamentals),
  // sector concentration and daily-loss/open-risk (both real, the same
  // math already gating the autopilots), plus the real credit/currency/
  // rate reads above. Tail/systemic/political/geopolitical/black-swan risk
  // still have NO real quantifiable source anywhere in this app — listed
  // as explicitly not covered rather than silently dropped or, worse,
  // presented as scored data with invented numbers.
  const riskCommandCenter = {
    concentrationRisk: portfolio && portfolio.topHoldingWeightPct != null ? (portfolio.topHoldingWeightPct >= 25 ? "HIGH" : portfolio.topHoldingWeightPct >= 15 ? "MODERATE" : "LOW") : null,
    topHoldingWeightPct: portfolio?.topHoldingWeightPct ?? null,
    volatilityRisk: weightedBeta == null ? null : weightedBeta >= 1.5 ? "HIGH" : weightedBeta >= 1.1 ? "MODERATE" : "LOW",
    weightedBeta,
    sectorConcentration: portfolio?.sectorConcentration ?? null,
    openRiskPct: portfolio?.openRiskPct ?? null,
    dailyBreakerTripped: portfolio?.dailyBreakerTripped ?? null,
    creditRisk, creditHygChgPct: hygChg,
    currencyRisk, currencyUupChgPct: uupChg,
    interestRateRisk, interestRateTltChgPct: tltChg,
    notCovered: ["Tail risk", "Systemic risk", "Political/geopolitical risk", "Black swan risk"],
  };

  // Record today's snapshot now that regime/capitalFlow/portfolio are all
  // computed — feeds tomorrow's (and next week's/month's/quarter's)
  // "What Changed?" real comparison. Recorded before the AI call so a
  // failed/timed-out generation still leaves today's real market state on
  // the record for future runs to diff against.
  try {
    appendSnapshot({
      regimeScore: regime.score, regimeLabel: regime.label, spyChg,
      topFlow: capitalFlow.slice(0, 3).map(s => ({ name: s.name, rel: s.rel })),
      bottomFlow: capitalFlow.slice(-3).map(s => ({ name: s.name, rel: s.rel })),
      portfolioEquity: portfolio?.equity ?? null,
      portfolioOpenRiskPct: portfolio?.openRiskPct ?? null,
    });
  } catch { /* best-effort — a history-write failure shouldn't break the brief */ }

  // Real per-stock fundamentals + analyst price targets, attached to each
  // ranked setup. /api/yahoo/fundamentals is single-symbol (confirmed live:
  // real marketCap/pe/epsForward/revenueGrowth/earningsGrowth/margins/
  // debtToEquity/freeCashflow/pegRatio, plus real analyst targetLow/Mean/
  // HighPrice + numberOfAnalystOpinions — a genuine, non-fabricated bear/
  // base/bull proxy). Bounded to the already-narrowed top-25 ranked list
  // (not the full 90-symbol scan universe) to keep this to 25 parallel
  // requests, same bounded-fan-out pattern used elsewhere in this app.
  const fundArr = await Promise.all(ranked.map(r => getJson(`/api/yahoo/fundamentals?symbol=${r.symbol}`)));
  ranked.forEach((r, i) => { r.fund = fundArr[i] || null; });
  ranked.forEach(r => { r.confidence = computeConfidence(r, insider, shortChg, riskCommandCenter.sectorConcentration); });
  const rankedMap = new Map(ranked.map(r => [r.symbol, r]));

  const fundSnippet = (f) => {
    if (!f) return "";
    const bits = [];
    if (Number.isFinite(f.marketCap) && f.marketCap > 0) bits.push(`mkt cap $${(f.marketCap / 1e9).toFixed(1)}B`);
    if (Number.isFinite(f.pe) && f.pe > 0) bits.push(`P/E ${f.pe.toFixed(1)}`);
    if (Number.isFinite(f.pegRatio) && f.pegRatio > 0) bits.push(`PEG ${f.pegRatio.toFixed(2)}`);
    if (Number.isFinite(f.revenueGrowth)) bits.push(`rev growth ${(f.revenueGrowth * 100).toFixed(1)}%`);
    if (Number.isFinite(f.profitMargin)) bits.push(`profit margin ${(f.profitMargin * 100).toFixed(1)}%`);
    if (Number.isFinite(f.debtToEquity)) bits.push(`D/E ${f.debtToEquity.toFixed(0)}`);
    if (f.recommendationKey) bits.push(`analyst: ${f.recommendationKey}${Number.isFinite(f.numberOfAnalystOpinions) ? ` (${f.numberOfAnalystOpinions} analysts)` : ""}`);
    return bits.length ? ` [${bits.join(", ")}]` : "";
  };
  const setupLines = ranked.map(r =>
    `${r.symbol}: A+ ${r.aplus.score}/100, ${r.next.action} (${r.next.reason}), RS ${r.rsRating}, ${r.passCount}/8 trend template, stage "${(r.stage || "").replace(/ —.*/, "")}", entry $${r.entry} stop $${r.stop} target $${r.target2}, ${r.atBuyPoint ? "AT buy point" : "not yet at buy point"}.${fundSnippet(r.fund)}`
  ).join("\n");

  // Same real insider/COT/short-interest synthesis smart-money-brief already
  // builds — reused verbatim rather than re-derived, so the two features
  // can't disagree about the same underlying data.
  const smartMoneyLines = [];
  if (insider?.ok && insider.results?.length) {
    const top = insider.results.slice(0, 8).map(r => r.ticker || r.symbol).filter(Boolean).join(", ");
    smartMoneyLines.push(`Insider buying (Form 4, last 3 days): ${top}.`);
  } else smartMoneyLines.push("Insider buying: no notable Form 4 buys scanned this run.");
  if (cot?.ok && cot.summary) {
    const s = cot.summary;
    smartMoneyLines.push(`COT institutional positioning (${s.reportDate || "latest"}): equities ${s.equityBias || "?"}, dollar ${s.dollarBias || "?"}, gold ${s.goldBias || "?"}, oil ${s.oilBias || "?"}.`);
  } else smartMoneyLines.push("COT positioning: unavailable this run.");
  if (shortChg?.ok && (shortChg.increasing?.length || shortChg.covering?.length)) {
    const inc = (shortChg.increasing || []).slice(0, 4).map(s => s.sym).join(", ");
    const cov = (shortChg.covering || []).slice(0, 4).map(s => s.sym).join(", ");
    smartMoneyLines.push(`Short interest: increasing shorts in ${inc || "none notable"}; covering in ${cov || "none notable"}.`);
  } else smartMoneyLines.push("Short interest changes: unavailable this run.");

  const newsArr = Array.isArray(news) ? news : (news?.news || news?.articles || news?.items || []);
  const newsLines = newsArr.slice(0, 10).map(n => `- ${n.title || n.headline || ""}`).filter(l => l.length > 2).join("\n");

  const vix = Number(macroArr.find(m => m.symbol === "VIXY")?.changesPercentage || 0);
  const macroLines = macroArr.map(m => `${m.symbol}: ${Number(m.changesPercentage || 0) >= 0 ? "+" : ""}${Number(m.changesPercentage || 0).toFixed(2)}%`).join(", ");

  const system = `You are ADVISOR — an institutional-grade Chief Investment Strategist writing a real research brief for one trader, not a marketing document. You are given REAL data below (regime score, real capital-flow performance across sectors plus crypto/gold/treasuries/credit, a real ranked list of A+ trade setups from this platform's own trend-template scan, each with real fundamentals — market cap, P/E, PEG, revenue/earnings growth, margins, debt/equity — and real Wall Street analyst price targets where available, a real avoid list of the lowest-scored names in today's scan with real reasons, the trader's real live portfolio — actual holdings, weights, unrealized P&L, and open risk — real insider Form 4 buys, real CFTC positioning, real short-interest changes, real headlines). For the 5-year thematic section, where you genuinely don't have live data, you have a web_search tool — use it and speak in terms of what you found.

Hard rules:
- Never invent a 13F filing, a Congress trade, a patent count, or any price/score/entry/stop/target/fundamental number — you do not type numbers, you only SELECT symbols from the real list below and explain why in prose. The platform attaches the real numbers itself after you respond.
- Every symbol in tactical/swing/position/core must come from the real A+ setups list below — never invent a ticker outside it. Pick 2-4 names per horizon where they genuinely fit; if fewer than 2 genuinely fit, return fewer — never pad with a weak justification.
- Use the real fundamentals in each setup's line (in brackets) to inform your "why" where relevant — e.g. don't call something "attractively valued" if its P/E and PEG are both stretched; a name with real revenue/earnings growth is a stronger "core" (1-year) candidate than one that's purely technical.
- The 5-year section is an explicitly thematic, web-search-informed thesis, not a scored trade. Tickers there may come from the real list OR be well-known real public companies in that theme (label which is which is not needed — just don't invent obscure/fake tickers).
- Be willing to disagree with the obvious read of the data if the evidence supports it. State uncertainty explicitly rather than projecting false confidence.
- actionPlan's "action" must be one of: BUY_NOW, ACCUMULATE, BUY_ON_PULLBACK, WAIT, WATCH, AVOID, REDUCE, SELL. REDUCE/SELL are ONLY valid for a symbol that appears in CURRENT PORTFOLIO below — never say REDUCE or SELL about a name that isn't a real, currently-held position (the platform will silently drop it if you do). For a held position, REDUCE/SELL should reflect its real state shown in CURRENT PORTFOLIO (e.g. real unrealized loss, real concentration weight) alongside the setup data, not a generic call.
- Return ONLY valid JSON, no markdown fences, no commentary before or after. Every "why"/"reason" string is plain prose, one sentence, no markdown.

Return exactly this JSON shape:
{
  "executiveSummary": "3-4 sentences: what changed, where money is flowing, the single biggest opportunity and biggest risk right now",
  "picks": {
    "tactical": [{"symbol":"XXX","why":"one sentence, 30-day horizon"}],
    "swing": [{"symbol":"XXX","why":"one sentence, 3-month horizon"}],
    "position": [{"symbol":"XXX","why":"one sentence, 6-month horizon"}],
    "core": [{"symbol":"XXX","why":"one sentence, 1-year horizon"}]
  },
  "thesis5y": [
    {"theme":"short theme name","why":"2-3 sentences grounded in web search","tickers":["XXX","YYY"]}
  ],
  "smartMoneyRead": "2-3 sentences synthesizing the real insider/COT/short-interest data — what it implies, not just restating it",
  "actionPlan": [
    {"symbol":"XXX","action":"BUY_NOW|ACCUMULATE|BUY_ON_PULLBACK|WAIT|WATCH|AVOID|REDUCE|SELL","reason":"one clause"}
  ]
}
thesis5y should have 2-3 themes. actionPlan should cover 6-10 of the most relevant real names from the setups list.`;

  const avoidLines = avoidList.map(a => `${a.symbol}: A+ ${a.score}/100, ${a.reasons.join(", ")}${a.stage ? `, stage "${a.stage}"` : ""}`).join("\n");
  const portfolioLines = portfolio
    ? `Equity $${fmt0(portfolio.equity)}, cash $${fmt0(portfolio.cash)}, ${portfolio.positionCount} open positions, open risk ${portfolio.openRiskPct}% (daily loss breaker: ${portfolio.dailyBreakerTripped ? "TRIPPED" : "ok"}), largest position ${portfolio.topHoldingWeightPct}% of book, top 3 positions ${portfolio.top3WeightPct}% of book, total unrealized P&L ${portfolio.totalUnrealizedPL >= 0 ? "+" : "-"}$${fmt0(Math.abs(portfolio.totalUnrealizedPL))}. Holdings: ${portfolio.holdings.slice(0, 10).map(h => `${h.symbol} (${h.weightPct}% of book, ${h.unrealizedPLpc >= 0 ? "+" : ""}${h.unrealizedPLpc.toFixed(1)}%${h.beta != null ? `, beta ${h.beta.toFixed(2)}` : ""})`).join(", ")}.${weightedBeta != null ? ` Portfolio-weighted beta: ${weightedBeta.toFixed(2)} (${riskCommandCenter.volatilityRisk} volatility risk).` : ""}`
    : "No live Alpaca account connected — portfolio-aware commentary not available this run.";

  const prompt = `MARKET REGIME: ${regime.label} (${regime.score}/100). SPY ${spyChg >= 0 ? "+" : ""}${spyChg.toFixed(2)}% today, VIXY ${vix >= 0 ? "+" : ""}${vix.toFixed(2)}%.
Macro: ${macroLines || "unavailable"}

CAPITAL FLOW (today, vs SPY — equity sectors + crypto/gold/treasuries/credit):
${capitalFlowLines || "unavailable"}

WHAT CHANGED (real regime-score and leadership deltas vs real past snapshots — reference in executiveSummary only where a horizon actually has data; do not mention a comparison horizon that says "no prior snapshots yet"):
${whatChangedLines}

REAL A+ SETUPS (this platform's own trend-template scan, ranked, pick only from these for tactical/swing/position/core/actionPlan):
${setupLines || "no qualifying setups right now"}

AVOID LIST (lowest-scored real names in today's scan, with real reasons — reference in executiveSummary if genuinely relevant, don't force it):
${avoidLines || "none"}

CURRENT PORTFOLIO (real live Alpaca account — use this to make the executiveSummary and smartMoneyRead genuinely portfolio-aware, e.g. flag real concentration risk or a real position already underwater, rather than generic market commentary):
${portfolioLines}

SMART MONEY DATA:
${smartMoneyLines.join("\n")}

RECENT HEADLINES:
${newsLines || "none fetched"}

Return the JSON now.`;

  // AI enrichment (picks curated by timeframe, actionPlan judgment calls,
  // 5-year thesis, executive narrative) attempted but not required —
  // regime/sectors/capitalFlow/whatChanged/ranked setups/avoidList/
  // portfolio/riskCommandCenter above are all already-computed real data.
  // Previously any AI failure returned null here, discarding all of that
  // real data too. Now: real data always builds; when the AI call fails,
  // actionPlan falls back to buildFallbackActionPlan (this platform's own
  // deterministic computeNextAction logic, not AI judgment), and the
  // AI-only fields (thesis5y, per-timeframe curation, narrative) are
  // honestly empty/labeled rather than fabricated.
  let raw = null;
  let aiError = null;
  try {
    // max_tokens is a per-turn budget that also covers the model's
    // web_search tool-use content (queries + returned results), not just
    // the final JSON — callAnthropicWithSearch only returns the LAST
    // turn's text (not accumulated), so this needs real headroom above the
    // target output size (confirmed live earlier at 1800 this silently
    // truncated mid-report). Bumped again here since structured JSON with
    // multiple picks per horizon is larger than the old single-pick prose.
    raw = await callAnthropicWithSearch(prompt + "\n\n" + system, KEY(), { model: "claude-sonnet-4-6", maxTokens: 6000, maxSearches: getMode() === "saver" ? 2 : 4, feature: "advisor-ai" });
  } catch (e) {
    aiError = e.message;
  }
  if (!aiError && (!raw || !raw.trim())) aiError = "AI call returned no usable output";

  let parsed = null;
  if (!aiError) {
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(m ? m[0] : raw);
    } catch {
      aiError = "AI response wasn't valid JSON";
    }
  }
  if (aiError) console.warn("[Advisor AI] AI enrichment unavailable, falling back to real-data-only:", aiError);

  const mapPicks = (arr) => (Array.isArray(arr) ? arr : [])
    .map(p => attachRealData(p, rankedMap))
    .filter(Boolean)
    .slice(0, 6);

  const thesis5y = parsed ? (Array.isArray(parsed.thesis5y) ? parsed.thesis5y : []).slice(0, 4).map(t => ({
    theme: String(t?.theme || "").slice(0, 80),
    why: String(t?.why || "").slice(0, 500),
    // Real tickers only get enriched with real score/action if they happen
    // to be in this run's scanned universe; thematic-only names (real
    // companies, just not in today's scan) are shown as plain chips with
    // no fabricated stats attached.
    tickers: (Array.isArray(t?.tickers) ? t.tickers : []).slice(0, 6).map(sym => {
      const row = rankedMap.get(String(sym || "").toUpperCase());
      return row ? { symbol: row.symbol, score: row.aplus.score, action: row.next.action } : { symbol: String(sym || "").toUpperCase(), score: null, action: null };
    }),
  })).filter(t => t.theme) : []; // genuinely AI-only speculative content — no real deterministic substitute exists

  // REDUCE/SELL are enriched from real portfolio holdings, not the scanned-
  // setups map — a real held position (e.g. OKTA in a real test portfolio)
  // isn't guaranteed to be inside SCAN_UNIVERSE/rankedMap, so requiring a
  // `row` there would silently drop a legitimate REDUCE/SELL call. Every
  // other action still requires the symbol to be a real scanned setup.
  const heldMap = new Map((portfolio?.holdings || []).map(h => [h.symbol, h]));
  const actionPlan = !parsed ? buildFallbackActionPlan(ranked, portfolio) : (Array.isArray(parsed.actionPlan) ? parsed.actionPlan : [])
    .map(p => {
      const symbol = String(p?.symbol || "").toUpperCase();
      const action = String(p?.action || "").toUpperCase().replace(/\s+/g, "_");
      const reason = String(p?.reason || "").slice(0, 200);
      if (["REDUCE", "SELL"].includes(action)) {
        const holding = heldMap.get(symbol);
        if (!holding) return null; // not a real currently-held position — drop rather than guess
        return { symbol, action, reason, held: true, weightPct: holding.weightPct, unrealizedPLpc: holding.unrealizedPLpc };
      }
      const row = rankedMap.get(symbol);
      if (!row) return null;
      if (!["BUY_NOW", "ACCUMULATE", "BUY_ON_PULLBACK", "WAIT", "WATCH", "AVOID"].includes(action)) return null;
      return { symbol: row.symbol, action, reason, score: row.aplus.score, confidence: row.confidence || null, held: heldMap.has(row.symbol) };
    }).filter(Boolean).slice(0, 12);

  // Without AI, there's no real substitute for "which timeframe fits this
  // setup" (a genuine judgment call) — rather than fake that curation,
  // the top real-ranked setups go into `swing` only, clearly a fallback
  // (not AI-curated), and the other three buckets stay honestly empty.
  const picks = parsed ? {
    tactical: mapPicks(parsed.picks?.tactical),
    swing: mapPicks(parsed.picks?.swing),
    position: mapPicks(parsed.picks?.position),
    core: mapPicks(parsed.picks?.core),
  } : {
    tactical: [],
    swing: ranked.slice(0, 5).map((r) => attachRealData({ symbol: r.symbol, why: r.next.reason }, rankedMap)).filter(Boolean),
    position: [],
    core: [],
  };

  // CEO Executive Brief — the spec's "one-page dashboard" concept, built as
  // a pure re-assembly of data that's already real and already computed
  // above (regime, capitalFlow, actionPlan, avoidList, ranked fundamentals,
  // picks, riskCommandCenter/portfolio holdings, scenarios). No new AI call,
  // no new data source, and nothing here is a number the model typed —
  // every field below traces back to a real endpoint or real platform math.
  const topOpportunities = actionPlan
    .filter(a => ["BUY_NOW", "ACCUMULATE", "BUY_ON_PULLBACK"].includes(a.action))
    .slice(0, 5);
  const topRisks = [
    ...actionPlan.filter(a => ["REDUCE", "SELL"].includes(a.action)).map(a => ({
      symbol: a.symbol, type: "portfolio", action: a.action, reason: a.reason,
    })),
    ...avoidList.slice(0, 3).map(a => ({
      symbol: a.symbol, type: "avoid", reason: a.reasons.join(", "),
    })),
  ].slice(0, 6);

  // Best growth/value from the same real fundamentals already attached to
  // `ranked` above — highest real revenue growth, lowest real PEG — never a
  // separate score, just picking the max/min of a real field.
  const withGrowth = ranked.filter(r => r.fund && Number.isFinite(r.fund.revenueGrowth));
  const bestGrowth = withGrowth.length
    ? withGrowth.reduce((best, r) => (r.fund.revenueGrowth > best.fund.revenueGrowth ? r : best))
    : null;
  const bestGrowthStock = bestGrowth ? {
    symbol: bestGrowth.symbol, score: bestGrowth.aplus.score,
    revenueGrowthPct: row2(bestGrowth.fund.revenueGrowth * 100),
  } : null;

  const withPeg = ranked.filter(r => r.fund && Number.isFinite(r.fund.pegRatio) && r.fund.pegRatio > 0);
  const bestValue = withPeg.length
    ? withPeg.reduce((best, r) => (r.fund.pegRatio < best.fund.pegRatio ? r : best))
    : null;
  const bestValueStock = bestValue ? {
    symbol: bestValue.symbol, score: bestValue.aplus.score,
    pegRatio: row2(bestValue.fund.pegRatio),
    pe: Number.isFinite(bestValue.fund.pe) ? row2(bestValue.fund.pe) : null,
  } : null;

  // Highest-risk asset: highest real beta among real held positions; falls
  // back to the weakest name on the real avoid list only when there's no
  // live portfolio (or no holding has a known beta) to draw from.
  const heldWithBeta = (portfolio?.holdings || []).filter(h => h.beta != null);
  const highestRiskHolding = heldWithBeta.length
    ? heldWithBeta.reduce((max, h) => (h.beta > max.beta ? h : max))
    : null;
  const highestRiskAsset = highestRiskHolding
    ? { symbol: highestRiskHolding.symbol, type: "held", beta: highestRiskHolding.beta, weightPct: highestRiskHolding.weightPct }
    : (avoidList[0] ? { symbol: avoidList[0].symbol, type: "avoid", score: avoidList[0].score, reasons: avoidList[0].reasons } : null);

  // Cash stance is a qualitative label deterministically derived from the
  // real regime score (same GREEN/YELLOW/RED thresholds computeRegime
  // already uses) — not a fabricated target cash percentage. The real
  // current cash % (if a live account is connected) is reported alongside
  // it as fact, not prescription.
  const cashStance = {
    label: regime.score >= 75 ? "Fully deployed" : regime.score >= 55 ? "Moderately deployed" : "Defensive",
    desc: regime.score >= 75
      ? "GREEN regime supports aggressive capital deployment; low cash drag favored."
      : regime.score >= 55
      ? "YELLOW regime warrants selective additions — keep some dry powder for confirmation."
      : "RED regime favors capital preservation — elevated cash allocation, avoid forcing new risk.",
    currentCashPct: portfolio && Number(portfolio.equity) > 0 ? row2((portfolio.cash / portfolio.equity) * 100) : null,
  };

  const ceoBrief = {
    marketRegime: { label: regime.label, score: regime.score, detail: regimeDetail },
    bestSector: capitalFlow[0] || null,
    worstSector: capitalFlow[capitalFlow.length - 1] || null,
    topOpportunities,
    topRisks,
    bestGrowthStock,
    bestValueStock,
    bestSwingTrade: picks.swing[0] || null,
    bestLongTermInvestment: picks.core[0] || null,
    highestRiskAsset,
    cashStance,
    invalidationConditions: scenarios.shiftConditions || [],
  };

  // Real-data-only fallback summary when AI enrichment failed — built from
  // real regime/scan data already on hand, not a fabricated narrative.
  const fallbackExecSummary = `${regime.label} regime (${regime.score}/100). ${actionPlan.length} real signal${actionPlan.length === 1 ? "" : "s"} from the deterministic trend-template scan (not AI-curated by timeframe). AI analysis unavailable this run${aiError ? ` (${aiError.slice(0, 100)})` : ""} — showing real computed data only.`;

  const built = {
    executiveSummary: parsed ? String(parsed.executiveSummary || "").slice(0, 1200) : fallbackExecSummary,
    aiUnavailable: !parsed,
    aiError: aiError || null,
    picks,
    thesis5y,
    smartMoneyRead: parsed ? String(parsed.smartMoneyRead || "").slice(0, 800) : "",
    actionPlan,
    avoidList,
    portfolio,
    riskCommandCenter,
    whatChanged,
    scenarios,
    ceoBrief,
    regime: { score: regime.score, label: regime.label, detail: regimeDetail },
    sectors,
    capitalFlow,
    universeSize: SCAN_UNIVERSE.length,
    setupsScanned: ranked.length,
    generatedAt: Date.now(),
  };
  saveCoachOutput("advisor", built);
  return built;
}

function loadAdvisorBrief() {
  const log = loadCoachLog();
  return log.advisor || null;
}

module.exports = { buildAdvisorBrief, loadAdvisorBrief, SCAN_UNIVERSE };
