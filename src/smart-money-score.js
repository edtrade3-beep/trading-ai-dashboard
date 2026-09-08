"use strict";

// smart-money-score.js — Smart Money Intelligence Score (2026-09-08, user's
// own spec: "Insider 20%, Institutional 20%, Options 15%, Analyst 10%,
// Technical 15%, Fundamental 10%, Catalyst/News 10%. Make weights
// configurable."). ANTI-DUPLICATION: this does NOT re-fetch or re-derive
// any underlying data — every sub-score is computed from real payloads
// this app's existing real engines already produce (Yahoo insider/
// institutional/analyst data, options-flow, Trade GPS's own technical
// score, future-value-scoring.js's fundamental score, news/store.js's
// per-ticker aggregation). institution-score.js already combines several
// of these into ONE real composite for a DIFFERENT purpose (Telegram's
// Accumulation/Distribution read, different weights, no analyst/
// technical/fundamental/catalyst) — this is a new, separately-weighted
// composite the user explicitly specified, not a replacement for that one.
//
// Every sub-score is null (never a guessed number) when its real source
// data is absent; a null sub-score is excluded from the weighted sum and
// its weight is real-time renormalized across whatever sub-scores DO have
// real evidence, so the final score is always an honest read of the
// evidence that actually exists — never silently anchored toward 50 by
// components with no real data.

const round1 = (n) => Math.round(n * 10) / 10;

const DEFAULT_WEIGHTS = {
  insider: 20, institutional: 20, options: 15, analyst: 10,
  technical: 15, fundamental: 10, catalyst: 10,
};

// Real insider sub-score — same real buy$/sell$ ratio formula
// institution-score.js's own insiderPts already uses (0-20pt scale there),
// rescaled to 0-100 here, PLUS a real, disclosed bonus for multiple
// distinct real buyers (spec's own named signal: "multiple insiders
// buying"). Null (not a guessed neutral) when there are no real recent
// transactions to read at all.
function scoreInsider(insiderTransactions) {
  const txns = insiderTransactions?.transactions || [];
  if (!txns.length) return { score: null, reason: "No real recent insider (Form 4) transactions on file." };
  const buys = txns.filter((t) => t.type === "BUY");
  const sells = txns.filter((t) => t.type === "SELL");
  const buyVal = buys.reduce((s, t) => s + (Number(t.value) || 0), 0);
  const sellVal = sells.reduce((s, t) => s + (Number(t.value) || 0), 0);
  const total = buyVal + sellVal;
  if (total <= 0) return { score: null, reason: "Real insider transactions on file carry no real dollar value." };
  const ratio = buyVal / total;
  const uniqueBuyers = new Set(buys.map((t) => t.owner || t.name).filter(Boolean)).size;
  // Documented judgment call, same convention as this app's other named
  // thresholds: +10 real bonus points for 3+ distinct real buyers, +5 for
  // 2, capped so the bonus alone can never push a net-selling read above
  // 60/100.
  const buyerBonus = uniqueBuyers >= 3 ? 10 : uniqueBuyers === 2 ? 5 : 0;
  const score = Math.max(0, Math.min(100, Math.round(ratio * 100 + buyerBonus)));
  return {
    score,
    reason: `Real Form 4 filings: $${(buyVal / 1e6).toFixed(2)}M bought vs $${(sellVal / 1e6).toFixed(2)}M sold across ${txns.length} real transaction(s)${uniqueBuyers >= 2 ? `, ${uniqueBuyers} distinct real buyers` : ""}.`,
  };
}

// Real institutional sub-score — same real net-share-change-vs-total-
// absolute-change formula institution-score.js's own instPts already
// uses, rescaled to 0-100. Null when Yahoo returns no real institutional
// rows (13F-derived; see providers/yahoo.js's own header on this being
// the one real per-symbol institutional-ownership source this app has).
function scoreInstitutional(institutional) {
  const institutions = institutional?.institutions || [];
  if (!institutions.length) return { score: null, reason: "No real 13F-derived institutional ownership rows on file for this symbol." };
  const netChange = institutions.reduce((s, i) => s + (Number(i.change) || 0), 0);
  const totalAbsChange = institutions.reduce((s, i) => s + Math.abs(Number(i.change) || 0), 0);
  if (totalAbsChange <= 0) return { score: null, reason: "Real institutional rows on file show no real reported share-count change." };
  const ratio = (netChange / totalAbsChange + 1) / 2;
  const score = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  const increasing = institutions.filter((i) => Number(i.change) > 0).length;
  const decreasing = institutions.filter((i) => Number(i.change) < 0).length;
  return {
    score,
    reason: `Real 13F-derived filings: ${increasing} institution(s) increasing, ${decreasing} reducing — net ${netChange >= 0 ? "+" : ""}${netChange.toLocaleString()} shares across ${institutions.length} reporting institution(s).`,
  };
}

// Real options sub-score — same real call$/put$ notional ratio
// institution-score.js's own flowPts already uses, rescaled to 0-100,
// with a real disclosed nudge toward the extremes when real unusual-
// flagged rows (interpretFlowRow's own real evidence-based flag,
// routes/market.js) skew heavily to one side.
function scoreOptions(flowSummary, unusualRows) {
  const callN = Number(flowSummary?.callNotional), putN = Number(flowSummary?.putNotional);
  const total = (Number.isFinite(callN) ? callN : 0) + (Number.isFinite(putN) ? putN : 0);
  if (total <= 0) return { score: null, reason: "No real recent options-flow notional on file." };
  const ratio = callN / total;
  let score = Math.round(ratio * 100);
  const unusualCalls = (unusualRows || []).filter((r) => r.side === "CALL").length;
  const unusualPuts = (unusualRows || []).filter((r) => r.side === "PUT").length;
  if (unusualCalls > unusualPuts * 2 && unusualCalls >= 2) score = Math.min(100, score + 10);
  else if (unusualPuts > unusualCalls * 2 && unusualPuts >= 2) score = Math.max(0, score - 10);
  return {
    score,
    reason: `Real options flow: ${Math.round(ratio * 100)}% call-weighted notional ($${(total / 1e6).toFixed(1)}M total)${(unusualCalls || unusualPuts) ? `, ${unusualCalls} unusual call vs ${unusualPuts} unusual put print(s)` : ""}.`,
  };
}

// Real analyst sub-score — combines two real signals: (1) the real
// upgrade/downgrade balance in Yahoo's own upgradeDowngradeHistory over
// the trailing real 90 days, (2) real implied upside (targetMean vs the
// real current price Yahoo's own financialData module reports alongside
// it). Documented judgment-call blend, not a standard formula — same
// convention as every other named threshold in this codebase.
function scoreAnalyst(analystRatings) {
  const hist = analystRatings?.history || [];
  const recentCutoff = Date.now() - 90 * 86400000;
  const recent = hist.filter((h) => h.date && new Date(h.date).getTime() >= recentCutoff);
  const ups = recent.filter((h) => h.action === "up").length;
  const downs = recent.filter((h) => h.action === "down").length;
  const targetMean = Number(analystRatings?.targetMean), currentPrice = Number(analystRatings?.currentPrice);
  const hasUpside = Number.isFinite(targetMean) && targetMean > 0 && Number.isFinite(currentPrice) && currentPrice > 0;
  const upsidePct = hasUpside ? ((targetMean - currentPrice) / currentPrice) * 100 : null;
  if (!recent.length && !hasUpside) return { score: null, reason: "No real recent analyst revisions or price-target data on file." };
  let score = 50;
  score += Math.max(-25, Math.min(25, (ups - downs) * 12));
  if (upsidePct != null) score += Math.max(-25, Math.min(25, upsidePct));
  score = Math.round(Math.max(0, Math.min(100, score)));
  const parts = [];
  if (recent.length) parts.push(`${ups} real upgrade(s) vs ${downs} real downgrade(s) in the trailing 90 real days`);
  if (upsidePct != null) parts.push(`real mean target implies ${upsidePct >= 0 ? "+" : ""}${upsidePct.toFixed(1)}% vs current price`);
  return { score, reason: `Real analyst data: ${parts.join(", ") || "no real recent activity"}.` };
}

const AVAILABLE_KEYS = ["insider", "institutional", "options", "analyst", "technical", "fundamental", "catalyst"];

// The one real composite — takes already-scored sub-components (0-100 or
// null) plus a real reason string each, real-renormalizes weights across
// whatever has real evidence, and classifies into the spec's own 5-tier
// verdict vocabulary. `technical`/`fundamental`/`catalyst` are passed in
// as {score, reason} directly (they're ALREADY real 0-100 reads from
// Trade GPS / future-value-scoring.js / news/store.js — this function
// does no new math on them, only combines).
function computeSmartMoneyScore({ insider, institutional, options, analyst, technical, fundamental, catalyst, weights = DEFAULT_WEIGHTS } = {}) {
  const subs = { insider, institutional, options, analyst, technical, fundamental, catalyst };
  const available = AVAILABLE_KEYS.filter((k) => Number.isFinite(subs[k]?.score));
  const missing = AVAILABLE_KEYS.filter((k) => !available.includes(k));
  if (!available.length) {
    return { score: null, band: "UNAVAILABLE", subScores: subs, weights, missing, reasons: ["No real evidence available across any component — cannot compute a real score."] };
  }
  const availableWeightTotal = available.reduce((s, k) => s + (Number(weights[k]) || 0), 0);
  const weighted = available.reduce((s, k) => s + subs[k].score * ((Number(weights[k]) || 0) / (availableWeightTotal || 1)), 0);
  const score = Math.round(Math.max(0, Math.min(100, weighted)));

  let band;
  if (score >= 80) band = "STRONG_BUY";
  else if (score >= 65) band = "BUY";
  else if (score >= 45) band = "WATCH";
  else if (score >= 25) band = "AVOID";
  else band = "SELL";

  const reasons = available.map((k) => subs[k].reason).filter(Boolean);
  if (missing.length) reasons.push(`Unavailable, excluded and reweighted: ${missing.join(", ")}.`);

  return { score, band, subScores: subs, weights, missing, reasons };
}

module.exports = {
  DEFAULT_WEIGHTS, scoreInsider, scoreInstitutional, scoreOptions, scoreAnalyst, computeSmartMoneyScore,
};
