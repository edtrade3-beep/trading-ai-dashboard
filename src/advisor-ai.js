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
const { saveCoachOutput, loadCoachLog } = require("./ai-coach-store");
const { PORT } = require("./config");

const KEY = () => (process.env.ANTHROPIC_API_KEY || "").trim();
const BASE = () => process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;
async function getJson(path) {
  try { const r = await fetch(`${BASE()}${path}`); return await r.json(); } catch { return null; }
}

// Same 11 real sector ETFs used elsewhere in this app (RhProDashboard,
// BreadthTab) — kept as its own constant rather than importing the
// frontend's market-helpers.js, matching this codebase's existing
// convention of each backend file defining its own relevant universe
// (see under10.js UNIVERSE, gapfill.js UNIVERSE).
const SECTOR_ETFS = [
  { symbol: "XLK", name: "Technology" }, { symbol: "XLF", name: "Financials" },
  { symbol: "XLE", name: "Energy" }, { symbol: "XLV", name: "Health Care" },
  { symbol: "XLI", name: "Industrials" }, { symbol: "XLY", name: "Cons. Discretionary" },
  { symbol: "XLP", name: "Cons. Staples" }, { symbol: "XLRE", name: "Real Estate" },
  { symbol: "XLU", name: "Utilities" }, { symbol: "XLB", name: "Materials" },
  { symbol: "XLC", name: "Comm. Services" },
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
    atBuyPoint: !!row.atBuyPoint,
    // Real fundamentals from /api/yahoo/fundamentals — null fields where
    // Yahoo doesn't have the data, never a guessed/interpolated value.
    fundamentals: f ? {
      marketCap: Number.isFinite(f.marketCap) ? f.marketCap : null,
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
  };
}

async function buildAdvisorBrief() {
  if (!KEY()) return null;

  const [macroRows, sectorRows, screen, insider, cot, shortChg, news] = await Promise.all([
    getJson("/api/market/quote?symbols=SPY,QQQ,IWM,VIXY,UUP,GLD,USO,TLT,HYG,IBIT"),
    getJson(`/api/market/quote?symbols=${SECTOR_ETFS.map(s => s.symbol).join(",")}`),
    getJson(`/api/market/trend-screen?symbols=${SCAN_UNIVERSE.join(",")}`),
    getJson("/api/scanner/insider"),
    getJson("/api/cot/status"),
    getJson("/api/market/short-changes"),
    getJson("/api/market/news?tickers=SPY,QQQ,NVDA,AAPL,MSFT,TSLA,AMD,META&limit=12"),
  ]);

  const { computeRegime, computeAPlusScore, computeNextAction } = require("./trade-planner-scoring");
  const macroArr = Array.isArray(macroRows) ? macroRows : [];
  const regime = computeRegime(macroArr);
  const spy = macroArr.find(m => m.symbol === "SPY");
  const spyChg = Number(spy?.changesPercentage || 0);

  // Real sector rankings — relative strength vs SPY today, same value-based
  // math RotationTab uses. Sent to the UI as real structured data directly
  // (not re-summarized by the model) — this is math the platform already
  // computes correctly, so there's no reason to let an LLM restate it.
  const sectorArr = Array.isArray(sectorRows) ? sectorRows : [];
  const sectors = SECTOR_ETFS.map(se => {
    const sd = sectorArr.find(x => x.symbol === se.symbol);
    return { name: se.name, symbol: se.symbol, chg: Number(sd?.changesPercentage || 0), rel: relStrength(sd, spyChg) };
  }).filter(s => Number.isFinite(s.chg)).sort((a, b) => b.rel - a.rel);
  const sectorLines = sectors.map(s => `${s.name} (${s.symbol}): ${s.chg >= 0 ? "+" : ""}${s.chg.toFixed(2)}% today, ${s.rel >= 0 ? "+" : ""}${s.rel.toFixed(2)}% vs SPY`).join("\n");

  // Real A+ setups from the platform's own trend-template + A+ Score engine
  // (same formula used everywhere else in this app: TopOpportunityCard,
  // RhProScanner, Trading Copilot's setups context). Widened from top-12 to
  // top-25 so the model has real room to pick multiple names per horizon
  // instead of being forced into one.
  const screenResults = (screen?.results || []).filter(r => !r.error && Number(r.entry) > Number(r.stop));
  const ranked = screenResults
    .map(r => ({ ...r, aplus: computeAPlusScore(r, regime), next: computeNextAction(r) }))
    .sort((a, b) => b.aplus.score - a.aplus.score)
    .slice(0, 25);

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

  const system = `You are ADVISOR — an institutional-grade Chief Investment Strategist writing a real research brief for one trader, not a marketing document. You are given REAL data below (regime score, real sector performance, a real ranked list of A+ trade setups from this platform's own trend-template scan, each with real fundamentals — market cap, P/E, PEG, revenue/earnings growth, margins, debt/equity — and real Wall Street analyst price targets where available, real insider Form 4 buys, real CFTC positioning, real short-interest changes, real headlines). For the 5-year thematic section, where you genuinely don't have live data, you have a web_search tool — use it and speak in terms of what you found.

Hard rules:
- Never invent a 13F filing, a Congress trade, a patent count, or any price/score/entry/stop/target/fundamental number — you do not type numbers, you only SELECT symbols from the real list below and explain why in prose. The platform attaches the real numbers itself after you respond.
- Every symbol in tactical/swing/position/core must come from the real A+ setups list below — never invent a ticker outside it. Pick 2-4 names per horizon where they genuinely fit; if fewer than 2 genuinely fit, return fewer — never pad with a weak justification.
- Use the real fundamentals in each setup's line (in brackets) to inform your "why" where relevant — e.g. don't call something "attractively valued" if its P/E and PEG are both stretched; a name with real revenue/earnings growth is a stronger "core" (1-year) candidate than one that's purely technical.
- The 5-year section is an explicitly thematic, web-search-informed thesis, not a scored trade. Tickers there may come from the real list OR be well-known real public companies in that theme (label which is which is not needed — just don't invent obscure/fake tickers).
- Be willing to disagree with the obvious read of the data if the evidence supports it. State uncertainty explicitly rather than projecting false confidence.
- actionPlan's "action" must be one of: BUY_NOW, ACCUMULATE, BUY_ON_PULLBACK, WAIT, WATCH, AVOID. There is no REDUCE/SELL — this brief has no visibility into what the trader currently holds, so never imply they should trim or exit an assumed existing position.
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
    {"symbol":"XXX","action":"BUY_NOW|ACCUMULATE|BUY_ON_PULLBACK|WAIT|WATCH|AVOID","reason":"one clause"}
  ]
}
thesis5y should have 2-3 themes. actionPlan should cover 6-10 of the most relevant real names from the setups list.`;

  const prompt = `MARKET REGIME: ${regime.label} (${regime.score}/100). SPY ${spyChg >= 0 ? "+" : ""}${spyChg.toFixed(2)}% today, VIXY ${vix >= 0 ? "+" : ""}${vix.toFixed(2)}%.
Macro: ${macroLines || "unavailable"}

SECTOR PERFORMANCE (today, vs SPY):
${sectorLines || "unavailable"}

REAL A+ SETUPS (this platform's own trend-template scan, ranked, pick only from these for tactical/swing/position/core/actionPlan):
${setupLines || "no qualifying setups right now"}

SMART MONEY DATA:
${smartMoneyLines.join("\n")}

RECENT HEADLINES:
${newsLines || "none fetched"}

Return the JSON now.`;

  let raw;
  try {
    // max_tokens is a per-turn budget that also covers the model's
    // web_search tool-use content (queries + returned results), not just
    // the final JSON — callAnthropicWithSearch only returns the LAST
    // turn's text (not accumulated), so this needs real headroom above the
    // target output size (confirmed live earlier at 1800 this silently
    // truncated mid-report). Bumped again here since structured JSON with
    // multiple picks per horizon is larger than the old single-pick prose.
    raw = await callAnthropicWithSearch(prompt + "\n\n" + system, KEY(), { model: "claude-sonnet-4-6", maxTokens: 6000, maxSearches: 4 });
  } catch {
    return null;
  }
  if (!raw || !raw.trim()) return null;

  let parsed;
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(m ? m[0] : raw);
  } catch {
    return null;
  }

  const mapPicks = (arr) => (Array.isArray(arr) ? arr : [])
    .map(p => attachRealData(p, rankedMap))
    .filter(Boolean)
    .slice(0, 6);

  const thesis5y = (Array.isArray(parsed.thesis5y) ? parsed.thesis5y : []).slice(0, 4).map(t => ({
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
  })).filter(t => t.theme);

  const actionPlan = (Array.isArray(parsed.actionPlan) ? parsed.actionPlan : [])
    .map(p => {
      const row = rankedMap.get(String(p?.symbol || "").toUpperCase());
      if (!row) return null;
      const action = String(p?.action || "").toUpperCase().replace(/\s+/g, "_");
      // REDUCE/SELL deliberately excluded — this brief has no portfolio-
      // holdings context (no fetch of the user's actual positions), so the
      // model would have to guess what's held to justify trimming/exiting
      // it. BUY_ON_PULLBACK is safe to add: like the other 5, it's purely
      // about entering a new position, not about an assumed existing one.
      if (!["BUY_NOW", "ACCUMULATE", "BUY_ON_PULLBACK", "WAIT", "WATCH", "AVOID"].includes(action)) return null;
      return { symbol: row.symbol, action, reason: String(p?.reason || "").slice(0, 200), score: row.aplus.score };
    }).filter(Boolean).slice(0, 12);

  const built = {
    executiveSummary: String(parsed.executiveSummary || "").slice(0, 1200),
    picks: {
      tactical: mapPicks(parsed.picks?.tactical),
      swing: mapPicks(parsed.picks?.swing),
      position: mapPicks(parsed.picks?.position),
      core: mapPicks(parsed.picks?.core),
    },
    thesis5y,
    smartMoneyRead: String(parsed.smartMoneyRead || "").slice(0, 800),
    actionPlan,
    regime: { score: regime.score, label: regime.label },
    sectors,
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

module.exports = { buildAdvisorBrief, loadAdvisorBrief };
