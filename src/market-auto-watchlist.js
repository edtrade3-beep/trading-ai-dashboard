// market-auto-watchlist.js — real, continuous market-wide scan that adds
// symbols showing a genuine GO (ready-to-pop buy point) or WATCH (actionable,
// still building) trend-template setup to the Watchlist automatically.
// Explicit user request 2026-07-26: "scan whole us market add all watch
// stocks ready to pop or in watch status in watch list automaticaly and
// make sure keep doing it" — "whole US market" isn't feasible on this app's
// free-tier data stack (no bulk feed for ~8,000 tickers), so scope was
// confirmed with the user as this curated ~96-symbol universe (mirrors
// axiom-live.jsx's MARKET_UNIVERSE_SYMBOLS, the same list already shown to
// the user as "Market Universe" client-side — kept as a separate copy here
// since the client bundle (ESM/JSX via esbuild) and this server file (CJS)
// don't share a module system; same precedent as advisor-ai.js's own
// separate SCAN_UNIVERSE).
//
// The real addition gate, isCandidate, never used GO/WATCH at all (entry >
// stop, passCount >= 6, !extended, only) — untouched below. GO/WATCH is only
// the Telegram announcement's own label for an already-added symbol.
//
// Migrated off row.verdict/row.atBuyPoint for that label (Legacy Verdict
// System migration, 2026-08-23) — those were _buildTrendTemplate's own
// pre-unification GO/WAIT/AVOID formula. Now reads the same real unified
// pipeline (buildEvFromRow -> computeEntryPlan -> computeRedFlags ->
// classifyDeepScanDecision) phases 5/7/8 already proved for this exact
// screenTrendTemplate row shape, reusing watchlist-setup-alerts.js's
// buildEvFromRow directly rather than a second copy.
//
// Additive-only and idempotent: only ever adds symbols not already on the
// Watchlist, never removes or reorders. Read-only against the account, so
// this does not need the SERVER_AUTOPILOT gate (same reasoning as
// watchlist-turn-alerts.js).
"use strict";

const { sendTelegramMessage, isConfigured: telegramConfigured } = require("./telegram");
const { shouldSendAlert } = require("./telegram-bot");
const { loadWatchlist, saveWatchlist } = require("./routes/watchlist");
const { isMarketHoursET } = require("./risk-guardrails");
const { computeRegime, regimeToEntryVocabulary, computeAPlusScore } = require("./trade-planner-scoring");
const { computeEntryPlan } = require("./entry-engine");
const { computeRedFlags } = require("./red-flag-engine");
const { classifyDeepScanDecision } = require("./btc-hpc-scan");
const { buildEvFromRow, ACTIONABLE_DECISIONS } = require("./watchlist-setup-alerts");

const MARKET_UNIVERSE_SYMBOLS = [
  "AAPL","MSFT","NVDA","AMZN","META","GOOGL","TSLA","AVGO","BRK.B","JPM","V","UNH","XOM","LLY","MA","HD","PG","COST","JNJ","MRK",
  "ABBV","KO","PEP","BAC","WMT","ORCL","CRM","ADBE","NFLX","CSCO","AMD","QCOM","TMO","MCD","INTU","ACN","DHR","ABT","LIN","TXN",
  "NEE","PM","DIS","CAT","NKE","PFE","INTC","AMAT","GE","IBM","NOW","AMGN","SPGI","BKNG","GS","PLTR","MU","PANW","UBER","SHOP",
  "SNOW","CRWD","ANET","ADP","BLK","AXP","MS","CVX","COP","SLB","EOG","FANG","MPC","OXY","RTX","LMT","BA","DE","MMM","HON",
  "UPS","FDX","UNP","CSX","NSC","C","WFC","SCHW","BX","KKR","APO","PGR","AON","MMC","CMCSA","TMUS","T","VZ","SBUX","CMG",
  "LOW","TJX","TGT","ROST","DG","DLTR","CVS","CI","HUM","ISRG","SYK","BSX","GILD","VRTX","REGN","MDT","BMY","SO","DUK","D",
  "PLD","AMT","EQIX","PSA","CCI","SPG","O","WELL","VICI","NEM","FCX","NUE","X","CLF","DAL","UAL","AAL","RCL","CCL","MAR",
  "HLT","ABNB","PYPL","SQ","COIN","HOOD","RIOT","MARA","SMCI","ARM","ASML","TSM","NVO","SAP","BABA","PDD","JD","MELI","SE",
];

const isCandidate = (r) => !r.error && Number(r.entry) > Number(r.stop) && (r.passCount || 0) >= 6 && !r.extended;

// Pure — the real unified-pipeline equivalent of the old row.verdict ===
// "GO" check: actionable BUY-family decision AND zero critical red flags
// (same "a critical flag overrides a high score, never hidden" rule
// watchlist-setup-alerts.js's own shouldAlert already applies). Kept as a
// standalone pure function (rather than inlined) so it's directly unit-
// testable without mocking the whole entry-plan/red-flag pipeline.
function isUnifiedGo(decision, criticalFlagCount) {
  return criticalFlagCount === 0 && ACTIONABLE_DECISIONS.has(decision);
}

async function runMarketAutoWatchlist(opts = {}) {
  // ignoreMarketHours: manual/on-demand trigger only (POST
  // /api/market/auto-watchlist/run) — the automatic 30-min setInterval in
  // server.js never passes this, so the real cron stays market-hours-gated
  // as designed.
  if (!opts.ignoreMarketHours && !isMarketHoursET()) return { ok: true, skipped: "outside market hours" };

  let screenTrendTemplate, fetchMarketQuotes, resolveProviderKeys;
  try {
    ({ screenTrendTemplate, fetchMarketQuotes } = require("./routes/market"));
    ({ resolveProviderKeys } = require("./config"));
  } catch { return { ok: false, added: [] }; }

  const { symbols: current } = loadWatchlist();
  const currentSet = new Set((current || []).map((s) => String(s).toUpperCase()));

  let rows;
  try { rows = await screenTrendTemplate(MARKET_UNIVERSE_SYMBOLS); } catch { return { ok: false, added: [] }; }

  const macroRows = await fetchMarketQuotes(["SPY", "QQQ", "VIXY"], resolveProviderKeys(new URLSearchParams())).catch(() => []);
  const regime = computeRegime(Array.isArray(macroRows) ? macroRows : []);
  const marketRegime = regimeToEntryVocabulary(regime.label);

  const goAdds = [];
  const watchAdds = [];
  for (const r of rows) {
    if (!isCandidate(r) || currentSet.has(r.symbol)) continue;
    const ev = buildEvFromRow(r, marketRegime);
    const entryPlan = computeEntryPlan(ev);
    const redFlagResult = computeRedFlags(ev);
    const { score: aPlusScore } = computeAPlusScore(r, regime);
    const deep = classifyDeepScanDecision({ entryPlan, aPlusScore });
    if (isUnifiedGo(deep.decision, redFlagResult.criticalCount)) goAdds.push(r.symbol);
    else watchAdds.push(r.symbol);
  }

  const newSymbols = [...goAdds, ...watchAdds];
  if (!newSymbols.length) return { ok: true, checked: rows.length, added: [] };

  const merged = [...(current || []), ...newSymbols];
  saveWatchlist(merged);

  if (telegramConfigured() && shouldSendAlert({ category: "opportunity" })) {
    const lines = [];
    if (goAdds.length) lines.push(`🟢 GO (ready to pop): ${goAdds.join(", ")}`);
    if (watchAdds.length) lines.push(`👀 WATCH (building): ${watchAdds.join(", ")}`);
    await sendTelegramMessage(`📡 *MARKET SCAN — ADDED TO WATCHLIST*\n\n${lines.join("\n")}`).catch(() => {});
  }

  return { ok: true, checked: rows.length, added: newSymbols, goAdds, watchAdds };
}

module.exports = { runMarketAutoWatchlist, MARKET_UNIVERSE_SYMBOLS, isUnifiedGo, isCandidate };
