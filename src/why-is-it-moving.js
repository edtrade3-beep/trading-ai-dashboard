// why-is-it-moving.js — A+ Market Intelligence, spec §7 (2026-09-05, see
// .claude/plans/proud-yawning-unicorn.md). A real, on-demand aggregator
// over already-existing, already-computed data — no new market-data
// fetch, no new scoring formula, no LLM call. Confidence values are
// real derived numbers (a news item's own already-computed impact
// score, or a real ratio of how much of the move a sector/market
// benchmark's own change could plausibly account for) — never a
// fabricated percentage. Spec's own mandatory rule, carried through
// exactly: zero qualifying candidates means an honest `unexplained:
// true`, never a forced weak guess.
"use strict";

const { etfOf } = require("./sector-theme-map");

const NEWS_IMPACT_THRESHOLD = 60; // matches this app's own HIGH-impact bar (src/news/scorer.js's impactClassification)
const RATIO_THRESHOLD = 20; // a sector/market move explaining less than a real 20% of the ticker's own move isn't a credible driver

// Real ratio: "how much of the ticker's own move could this benchmark's
// own move plausibly account for" — 0 when directions disagree (a
// falling sector can't explain a rising stock), capped at 95 (never
// claims to fully explain a move with a single external factor).
function explanatoryRatio(tickerChg, benchmarkChg) {
  if (!Number.isFinite(tickerChg) || !Number.isFinite(benchmarkChg) || tickerChg === 0) return 0;
  if ((tickerChg > 0) !== (benchmarkChg > 0)) return 0; // opposite directions never "explain" the move
  return Math.max(0, Math.min(95, Math.round(Math.abs(benchmarkChg / tickerChg) * 100)));
}

// newsItems: recent real scored rows for this ticker (news/store.js's
// getFeed({ticker}) shape — impact_score, category, headline, sentiment).
// sectorChg/marketChg: real % change of the ticker's own sector ETF and
// of SPY (or QQQ, whichever moved more) today.
function rankMoveDrivers({ tickerChg, sectorName, sectorChg, marketChg, newsItems = [] }) {
  const candidates = [];

  for (const item of newsItems) {
    const impact = Number(item.impact_score);
    if (Number.isFinite(impact) && impact >= NEWS_IMPACT_THRESHOLD) {
      candidates.push({ type: "NEWS", label: item.headline, confidence: impact, detail: item.category || null, url: item.url || null });
    }
  }

  const sectorRatio = explanatoryRatio(tickerChg, sectorChg);
  if (sectorRatio >= RATIO_THRESHOLD) {
    candidates.push({ type: "SECTOR", label: `${sectorName || "Sector"} ${sectorChg > 0 ? "strength" : "weakness"} (${sectorChg > 0 ? "+" : ""}${sectorChg.toFixed(2)}%)`, confidence: sectorRatio, detail: null, url: null });
  }

  const marketRatio = explanatoryRatio(tickerChg, marketChg);
  if (marketRatio >= RATIO_THRESHOLD) {
    candidates.push({ type: "MARKET", label: `Broad market move (${marketChg > 0 ? "+" : ""}${marketChg.toFixed(2)}%)`, confidence: marketRatio, detail: null, url: null });
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  const drivers = candidates.slice(0, 4);
  return { drivers, unexplained: drivers.length === 0 };
}

async function computeWhyIsItMoving(symbol) {
  const { fetchMarketQuotes } = require("./routes/market");
  const { getFeed, isReady } = require("./news/store");
  const { resolveProviderKeys, PORT } = require("./config");
  const keys = resolveProviderKeys(new URLSearchParams());

  const base = () => process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;
  const getJson = async (p) => { try { const r = await fetch(`${base()}${p}`); return await r.json(); } catch { return null; } };

  const [quotes, macroRegime, newsResult] = await Promise.all([
    fetchMarketQuotes([symbol, "SPY", "QQQ"], keys).catch(() => []),
    getJson("/api/market/macro-regime"),
    isReady() ? getFeed({ ticker: symbol, sinceMinutes: 1440, limit: 5 }).catch(() => ({ rows: [] })) : Promise.resolve({ rows: [] }),
  ]);

  const bySym = new Map((quotes || []).map((q) => [String(q.symbol || "").toUpperCase(), q]));
  const tickerQuote = bySym.get(String(symbol).toUpperCase());
  const tickerChg = Number(tickerQuote?.changesPercentage ?? tickerQuote?.delta1d);
  if (!tickerQuote || !Number.isFinite(tickerChg)) {
    return { ok: false, symbol, error: "Real price/change data unavailable for this symbol right now." };
  }

  const spyChg = Number(bySym.get("SPY")?.changesPercentage ?? bySym.get("SPY")?.delta1d);
  const qqqChg = Number(bySym.get("QQQ")?.changesPercentage ?? bySym.get("QQQ")?.delta1d);
  // Whichever real broad-market benchmark moved more today — the
  // stronger, more relevant real comparison for this specific move.
  const marketChg = [spyChg, qqqChg].filter(Number.isFinite).sort((a, b) => Math.abs(b) - Math.abs(a))[0] ?? null;

  const etf = etfOf(String(symbol).toUpperCase());
  const sectorRow = etf && macroRegime?.sectorRotation?.ranked
    ? macroRegime.sectorRotation.ranked.find((s) => s.sym === etf)
    : null;

  const { drivers, unexplained } = rankMoveDrivers({
    tickerChg,
    sectorName: sectorRow?.name || null,
    sectorChg: Number.isFinite(sectorRow?.change) ? sectorRow.change : null,
    marketChg,
    newsItems: newsResult?.rows || [],
  });

  return { ok: true, symbol: String(symbol).toUpperCase(), tickerChg, drivers, unexplained };
}

module.exports = { computeWhyIsItMoving, rankMoveDrivers, explanatoryRatio, NEWS_IMPACT_THRESHOLD, RATIO_THRESHOLD };
