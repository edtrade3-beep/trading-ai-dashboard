import { computeAPlusScore } from "./market-helpers.js";

// cortex-engine.js — AM Cortex's deterministic core (explicit user request,
// 2026-08-11: "AM CORTEX — AI TRADING INTELLIGENCE ENGINE... The AI must
// not invent market data or technical signals. Use deterministic
// calculations and real data wherever possible. AI's job: Retrieve →
// Analyze → Prioritize → Explain"). Every function below is a pure
// function over already-computed real engine outputs (Sniper Decision,
// A+ Score, the reversal detector, the Future/Value read) — no LLM call,
// no invented numbers. This app already has a real LLM chatbot
// (TradingCopilot.jsx → /api/market/ai-copilot); Cortex is deliberately
// NOT a second one, per the user's own explicit "do not build a generic
// AI chatbot" instruction — it's a structured decision console.

const round2 = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : null);

// ---- Query parsing (deterministic — regex/heuristics, no LLM call) ----

const SCAN_PATTERNS = [
  { re: /future\s*\+?\s*undervalued|undervalued.*future|future.*undervalued/i, scanType: "overlap" },
  { re: /undervalued/i, scanType: "undervalued" },
  { re: /future( growth)? stocks?|growth potential|major market leaders?/i, scanType: "future" },
  { re: /institutional accumulation|accumulation/i, scanType: "institutional" },
  { re: /breaking out of vcp|vcp breakout|vcp/i, scanType: "breakout" },
  { re: /not overextended|aren'?t overextended|isn'?t overextended/i, scanType: "strong_not_extended" },
  { re: /improving fundamentals/i, scanType: "improving_fundamentals" },
  { re: /best risk\s*\/?\s*reward|best reward\s*\/?\s*risk/i, scanType: "best_rr" },
  { re: /a\+? ?setups?|best setup/i, scanType: "aplus" },
  { re: /^find\b|^scan\b|^show me\b/i, scanType: "aplus" }, // generic "find/scan" catch-all
];

function extractPriceThreshold(q) {
  const m = q.match(/under\s*\$?(\d+(?:\.\d+)?)/i) || q.match(/below\s*\$?(\d+(?:\.\d+)?)/i);
  return m ? Number(m[1]) : null;
}

const STOPWORDS = new Set([
  "I", "A", "THE", "IS", "FOR", "ON", "OF", "TO", "AT", "BUY", "SELL", "WHY", "WHAT", "THIS",
  "LIKE", "STOCK", "STOCKS", "AND", "OR", "WITH", "UNDER", "BEST", "FIND", "MOVING", "PRICE",
  "SHOULD", "PAY", "SETUP", "VCP", "RSI", "ARE", "BIG", "IT", "MY", "ME", "WOULD", "COULD",
  "INVALIDATE", "TRADE", "HERE", "TODAY", "GROWTH", "WEAK", "STRONG", "SCAN", "SHOW",
]);

function extractSymbols(q, knownSymbols) {
  const tokens = (q.toUpperCase().match(/\b[A-Z]{1,5}\b/g) || []).filter((t) => !STOPWORDS.has(t));
  if (!knownSymbols) return tokens;
  // Known real tickers first (avoids treating a random capitalized word as a symbol).
  const known = tokens.filter((t) => knownSymbols.has(t));
  return known.length ? known : tokens;
}

// Returns { intent: 'symbol'|'scan'|'compare'|'price_to_pay'|'empty'|'unknown', ... }
export function parseCortexQuery(query, knownSymbols) {
  const q = String(query || "").trim();
  if (!q) return { intent: "empty", raw: q };

  const cmp = q.match(/compare\s+([a-z.]{1,6})\s+(?:vs\.?|versus|and)\s+([a-z.]{1,6})(?:\s+(?:vs\.?|versus|and)\s+([a-z.]{1,6}))?/i);
  if (cmp) {
    const symbols = [cmp[1], cmp[2], cmp[3]].filter(Boolean).map((s) => s.toUpperCase());
    return { intent: "compare", symbols, raw: q };
  }

  const priceMatch = q.match(/what price should i pay for\s+([a-z.]{1,6})/i);
  if (priceMatch) return { intent: "price_to_pay", symbol: priceMatch[1].toUpperCase(), raw: q };

  for (const p of SCAN_PATTERNS) {
    if (p.re.test(q)) return { intent: "scan", scanType: p.scanType, maxPrice: extractPriceThreshold(q), raw: q };
  }

  const symbols = extractSymbols(q, knownSymbols);
  if (symbols.length) return { intent: "symbol", symbol: symbols[0], raw: q };

  return { intent: "unknown", raw: q };
}

// ---- Heat Risk Engine (2026-08-11) — no pre-existing engine under this
// name; built here from real signals the app ALREADY computes elsewhere
// (Sniper Decision's gates/reversal detector, the screener's extended/
// stage fields) rather than inventing new ones. Exactly the 5 states the
// user specified. ----
export function computeHeatRisk(row, sniper) {
  const rev = sniper?.reversal;
  const extended = !!row?.extended;
  const dayChg = Number(row?.dayChangePct);
  const volRatio = Number(row?.volRatio ?? row?.volSurge);
  const climaxMove = Number.isFinite(dayChg) && Number.isFinite(volRatio) && Math.abs(dayChg) >= 5 && volRatio >= 2.5;
  const stage4 = /Stage\s*4/i.test(String(row?.stage || ""));

  if (rev?.isTop && (rev.topScore >= 6 || climaxMove)) {
    return {
      state: "CLIMACTIC_DANGER", label: "CLIMACTIC DANGER", color: "#c8282a", icon: "🔴",
      reason: rev.sigs?.length ? rev.sigs.map((s) => s.txt).join(" · ") : "Exhaustion signals present near a real extreme.",
    };
  }
  if (extended || rev?.isTop) {
    return {
      state: "OVEREXTENDED_DO_NOT_CHASE", label: "OVEREXTENDED — DO NOT CHASE", color: "#e08a1e", icon: "🟠",
      reason: extended && Number.isFinite(row?.abovePivotPct) ? `${row.abovePivotPct.toFixed(1)}% above pivot — chasing risk.` : (rev?.verdict || "Stretched from recent structure."),
    };
  }
  if (stage4 || sniper?.action === "AVOID") {
    return {
      state: "WEAK_AVOID", label: "WEAK — AVOID", color: "#c8282a", icon: "🔴",
      reason: stage4 ? "Stage 4 downtrend — below key moving averages." : (sniper?.reason || "Trend not supportive."),
    };
  }
  if (sniper?.action === "ENTER_LONG" && !extended) {
    return { state: "HEALTHY_STRENGTH", label: "HEALTHY STRENGTH", color: "#0d9465", icon: "🟢", reason: "Trend, volume, and entry timing are aligned." };
  }
  return { state: "NEUTRAL_WAIT", label: "NEUTRAL — WAIT", color: "#d6a312", icon: "🟡", reason: sniper?.reason || "No clear real edge either way right now." };
}

// ---- Cortex Verdict — one of exactly 5, combining real Sniper action +
// real Heat Risk state + real A+ Score. Separates "good stock" from "good
// entry" per the user's explicit instruction. ----
export function computeCortexVerdict({ sniper, heat, aplusScore }) {
  if (heat?.state === "CLIMACTIC_DANGER" || heat?.state === "WEAK_AVOID") {
    return { verdict: "AVOID", icon: "🔴", color: "#c8282a", reason: heat.reason };
  }
  if (heat?.state === "OVEREXTENDED_DO_NOT_CHASE") {
    return { verdict: "OVEREXTENDED", icon: "🟠", color: "#e08a1e", reason: "Strong stock, but current entry has poor reward/risk — wait for a pullback." };
  }
  if (sniper?.action === "ENTER_LONG" && heat?.state === "HEALTHY_STRENGTH") {
    return { verdict: "BUY ZONE", icon: "🟢", color: "#0d9465", reason: sniper.reason || "Setup and timing are both real right now." };
  }
  if (Number.isFinite(aplusScore) && aplusScore >= 65) {
    return { verdict: "WATCH", icon: "🟢", color: "#5ab552", reason: "Strong setup building — not at the buy point yet." };
  }
  return { verdict: "WAIT", icon: "🟡", color: "#d6a312", reason: sniper?.reason || "Not enough real edge to act yet." };
}

// ---- Price-to-Pay framework — real pivot/stop/target math already
// computed by Sniper Decision (src/sniper-decision.js), reframed as an
// entry menu. No new valuation model. ----
export function computePriceToPay(row, sniper) {
  const price = Number.isFinite(row?.price) ? row.price : null;
  const pivot = Number.isFinite(sniper?.pivot) ? sniper.pivot : (Number.isFinite(row?.pivot) ? row.pivot : null);
  if (!pivot) return null;
  const stop = Number.isFinite(sniper?.stop) ? sniper.stop : null;
  const target = Number.isFinite(sniper?.target2) ? sniper.target2 : null;
  return {
    current: price,
    idealEntryLow: round2(pivot * 0.99),
    idealEntryHigh: round2(pivot * 1.03),
    aggressiveEntry: Number.isFinite(price) && price < pivot ? round2(price) : null,
    breakoutEntry: round2(pivot),
    invalidation: stop,
    target,
    rr: Number.isFinite(sniper?.rr) ? sniper.rr : null,
  };
}

// ---- WHY evidence — real reasons already generated by the Sniper Decision
// and A+ Score engines, just merged and deduped for the "WHY?" expander. ----
export function whyEvidence(sniper, aplus) {
  const list = [...(sniper?.reasons || []), ...(aplus?.reasons || [])];
  return [...new Set(list)].slice(0, 8);
}

// ---- Scan-type queries — filter/rank over already-fetched real screener
// rows. No per-symbol dark-pool/options-flow/insider fetch across a whole
// ~100-symbol universe (too expensive per query) — institutional
// accumulation here is a real volume + price-structure PROXY, always
// labeled as such; the real block/options read lives in that symbol's own
// Deep Scan. ----
function byPrice(rows, maxPrice) {
  return maxPrice ? rows.filter((r) => Number(r.price) <= maxPrice) : rows;
}

export function rankAplusSetups(rows, regime, { maxPrice } = {}) {
  return byPrice(rows, maxPrice)
    .map((r) => ({ row: r, aplus: computeAPlusScore(r, regime) }))
    .filter((x) => x.aplus.score >= 60)
    .sort((a, b) => b.aplus.score - a.aplus.score)
    .slice(0, 20);
}

export function rankBreakouts(rows, regime, { maxPrice } = {}) {
  return byPrice(rows, maxPrice)
    .filter((r) => r.atBuyPoint || (r.actionable && Number(r.abovePivotPct ?? -99) >= -3))
    .map((r) => ({ row: r, aplus: computeAPlusScore(r, regime) }))
    .sort((a, b) => b.aplus.score - a.aplus.score)
    .slice(0, 20);
}

export function rankStrongNotExtended(rows, regime, { maxPrice } = {}) {
  return byPrice(rows, maxPrice)
    .filter((r) => (r.rsRating || 0) >= 70 && !r.extended)
    .map((r) => ({ row: r, aplus: computeAPlusScore(r, regime) }))
    .sort((a, b) => (b.row.rsRating || 0) - (a.row.rsRating || 0))
    .slice(0, 20);
}

export function rankBestRewardRisk(rows, regime, { maxPrice } = {}) {
  return byPrice(rows, maxPrice)
    .filter((r) => Number.isFinite(r.riskPct) && r.riskPct > 0 && Number.isFinite(r.target2) && Number.isFinite(r.entry))
    .map((r) => ({ row: r, aplus: computeAPlusScore(r, regime), rr: round2((r.target2 - r.entry) / (r.entry - r.stop)) }))
    .filter((x) => Number.isFinite(x.rr) && x.rr > 0)
    .sort((a, b) => b.rr - a.rr)
    .slice(0, 20);
}

export function rankInstitutionalAccumulation(rows, { maxPrice } = {}) {
  return byPrice(rows, maxPrice)
    .map((r) => {
      const volRatio = Number(r.volRatio ?? r.volSurge) || 0;
      const dayChg = Number(r.dayChangePct) || 0;
      const rs = Number(r.rsRating) || 0;
      let score = 0;
      if (volRatio >= 1.4) score += Math.min(30, volRatio * 12);
      if (dayChg > 0 && volRatio >= 1.2) score += 20;
      if (r.tightening) score += 20;
      if (rs >= 70) score += Math.min(30, rs - 50);
      return { row: r, accScore: Math.round(Math.min(100, score)) };
    })
    .filter((x) => x.accScore >= 45)
    .sort((a, b) => b.accScore - a.accScore)
    .slice(0, 20);
}

// Reuses the Future/Value scan's already-fetched real growth data — no
// separate fetch. "Improving fundamentals" = real growth-durability read
// (src/future-value-scoring.js's GROWTH_SCORE), not a fabricated trend.
export function rankImprovingFundamentals(futureValueRows) {
  return (futureValueRows || [])
    .filter((r) => Number.isFinite(r.growthScore) && r.growthScore >= 60)
    .sort((a, b) => b.growthScore - a.growthScore)
    .slice(0, 20);
}

export const SCAN_LABELS = {
  overlap: { icon: "🏆", title: "FUTURE + UNDERVALUED" },
  undervalued: { icon: "💎", title: "UNDERVALUED STOCKS" },
  future: { icon: "🚀", title: "FUTURE STOCKS" },
  institutional: { icon: "🏦", title: "INSTITUTIONAL ACCUMULATION (volume + structure proxy)" },
  breakout: { icon: "📈", title: "VCP BREAKOUT SETUPS" },
  strong_not_extended: { icon: "💪", title: "STRONG, NOT OVEREXTENDED" },
  best_rr: { icon: "⚖️", title: "BEST REWARD/RISK" },
  aplus: { icon: "⭐", title: "A+ SETUPS" },
  improving_fundamentals: { icon: "📊", title: "IMPROVING FUNDAMENTALS" },
};
