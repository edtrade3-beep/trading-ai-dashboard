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
// Scope, per explicit user decision: one real synthesized brief (not five
// full 10-20-stock portfolios) — an executive summary, a highest-conviction
// idea per time horizon drawn from the platform's own real A+ scan (where
// one genuinely fits — "no real setup fits this horizon today" is a valid,
// honest answer), real sector rankings, a web-search-informed long-horizon
// thematic section, and a real smart-money read reusing the same insider/
// COT/short-interest data smart-money-brief already computes.
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

// Same liquid-cap universe pattern used by other real-time scanners in this
// app (gap-scan.js's GAP_UNIVERSE, RH_UNIVERSE) — broad enough for a real
// A+ scan without the cost of screening the whole market.
const SCAN_UNIVERSE = [
  "AAPL","MSFT","NVDA","AMZN","META","GOOGL","AVGO","TSLA","AMD","NFLX",
  "CRM","ORCL","ADBE","NOW","PANW","CRWD","PLTR","SNOW","MU","QCOM",
  "ANET","MRVL","SMCI","ARM","COIN","UBER","ABNB","SHOP","LRCX","TSM",
  "LLY","V","MA","JPM","COST","CAT","VRT","NEE","CCJ","CEG",
  "DELL","MARA","RIOT","HOOD","NET","DDOG","ZS","APP","RKLB","ASTS",
];

function relStrength(sd, spyChg) {
  return Number((sd?.changesPercentage ?? 0) - spyChg);
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
  // math RotationTab uses (fixed earlier this session away from rank-based
  // badges to match its own stated RS threshold).
  const sectorArr = Array.isArray(sectorRows) ? sectorRows : [];
  const sectors = SECTOR_ETFS.map(se => {
    const sd = sectorArr.find(x => x.symbol === se.symbol);
    return { name: se.name, symbol: se.symbol, chg: Number(sd?.changesPercentage || 0), rel: relStrength(sd, spyChg) };
  }).filter(s => Number.isFinite(s.chg)).sort((a, b) => b.rel - a.rel);
  const sectorLines = sectors.map(s => `${s.name} (${s.symbol}): ${s.chg >= 0 ? "+" : ""}${s.chg.toFixed(2)}% today, ${s.rel >= 0 ? "+" : ""}${s.rel.toFixed(2)}% vs SPY`).join("\n");

  // Real top A+ setups from the platform's own trend-template + A+ Score
  // engine (same formula used everywhere else in this app: TopOpportunityCard,
  // RhProScanner, Trading Copilot's setups context) — not a separate,
  // second-guessed system.
  const screenResults = (screen?.results || []).filter(r => !r.error && Number(r.entry) > Number(r.stop));
  const ranked = screenResults
    .map(r => ({ ...r, aplus: computeAPlusScore(r, regime), next: computeNextAction(r) }))
    .sort((a, b) => b.aplus.score - a.aplus.score)
    .slice(0, 12);
  const setupLines = ranked.map(r =>
    `${r.symbol}: A+ ${r.aplus.score}/100, ${r.next.action} (${r.next.reason}), RS ${r.rsRating}, ${r.passCount}/8 trend template, stage "${(r.stage || "").replace(/ —.*/, "")}", entry $${r.entry} stop $${r.stop} target $${r.target2}, ${r.atBuyPoint ? "AT buy point" : "not yet at buy point"}.`
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

  const system = `You are ADVISOR — an institutional-grade Chief Investment Strategist writing a real research brief for one trader, not a marketing document. You are given REAL data below (regime score, real sector performance, a real ranked list of A+ trade setups from this platform's own trend-template scan, real insider Form 4 buys, real CFTC positioning, real short-interest changes, real headlines). For long-horizon/thematic reasoning where you genuinely don't have live data (5-year industry theses, macro/geopolitical context), you have a web_search tool — use it and speak in terms of what you found, not invented specifics.

Hard rules:
- Never invent a 13F filing, a Congress trade, a patent count, or any specific number you don't actually have from the data below or a real web search. If asked-for data isn't available, say so plainly ("not tracked by this platform") rather than fabricating a plausible-looking figure.
- Every near-term pick (30-day/3-month/6-month/1-year) must come from the real A+ setups list below — do not invent tickers outside it. If nothing in the list genuinely fits a given horizon, say so honestly instead of forcing a pick.
- The 5-year section is explicitly a thematic, web-search-informed thesis, not a scored trade — label it as such.
- Be willing to disagree with the obvious read of the data if the evidence supports it. State uncertainty explicitly rather than projecting false confidence.

Return this structure, plain text, no markdown symbols, under 900 words total:

EXECUTIVE SUMMARY: 3-4 sentences — what changed, where money is flowing, the single biggest opportunity and biggest risk right now.

TACTICAL PICK (30 days): One real setup from the list (or "none qualifies right now" if true) with why-now, entry, stop, target, confidence.

SWING PICK (3 months) / POSITION PICK (6 months) / CORE PICK (1 year): One real setup each (may repeat the tactical pick if it also fits a longer thesis, or say none fits) with reasoning specific to that horizon.

5-YEAR THEMATIC THESIS: 2-3 industries you believe reshape the next 5 years, grounded in web search for current context, with which real names in the setups list (if any) already sit in that theme.

SECTOR RANKINGS: Rank today's real sector performance, one line each, strongest to weakest.

SMART MONEY READ: 2-3 sentences synthesizing the real insider/COT/short-interest data — what it implies, not just restating it.

CEO ACTION PLAN: One line each — BUY NOW / ACCUMULATE / WAIT / WATCH / AVOID — naming real tickers from the data, with a one-clause reason each.`;

  const prompt = `MARKET REGIME: ${regime.label} (${regime.score}/100). SPY ${spyChg >= 0 ? "+" : ""}${spyChg.toFixed(2)}% today, VIXY ${vix >= 0 ? "+" : ""}${vix.toFixed(2)}%.
Macro: ${macroLines || "unavailable"}

SECTOR PERFORMANCE (today, vs SPY):
${sectorLines || "unavailable"}

TOP REAL A+ SETUPS (this platform's own trend-template scan, ranked):
${setupLines || "no qualifying setups right now"}

SMART MONEY DATA:
${smartMoneyLines.join("\n")}

RECENT HEADLINES:
${newsLines || "none fetched"}

Write the full ADVISOR brief now, following the structure exactly.`;

  let report;
  try {
    // max_tokens is a per-turn budget that also covers the model's
    // web_search tool-use content (queries + returned results), not just
    // the final report text, and callAnthropicWithSearch only returns the
    // LAST turn's text (not accumulated) — if that turn hits max_tokens
    // mid-report (stop_reason "max_tokens", not "pause_turn"), the loop
    // breaks and silently returns a truncated report. Confirmed live: 1800
    // cut the real report off before SMART MONEY READ / CEO ACTION PLAN
    // ever rendered, even with a ~900-word cap in the system prompt —
    // models don't reliably self-limit, so this needs real headroom above
    // the target, not exactly the target.
    report = await callAnthropicWithSearch(prompt + "\n\n" + system, KEY(), { model: "claude-sonnet-4-6", maxTokens: 4500, maxSearches: 4 });
  } catch {
    return null;
  }
  if (!report || !report.trim()) return null;

  const built = {
    report: report.trim(),
    regime: { score: regime.score, label: regime.label },
    topSetups: ranked.slice(0, 5).map(r => ({ symbol: r.symbol, score: r.aplus.score, action: r.next.action })),
    sectors: sectors.slice(0, 3).map(s => s.name),
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
