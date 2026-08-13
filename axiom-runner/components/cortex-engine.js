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
  // Real "buy lower" alternative to the breakout zone (explicit user
  // request, 2026-08-12: "i would like to buy low any ideas"). If price
  // hasn't broken out yet, today's real price already IS the cheaper
  // aggressive entry (below). If it already has, the real lower-price
  // alternative is a pullback to the 50-day MA in a confirmed uptrend —
  // Minervini's own real "buy strength cheaper on a dip" level, not a
  // fabricated support line. Only surfaced when it's genuinely below
  // today's price.
  const ma50 = Number.isFinite(row?.ma50) ? Number(row.ma50) : null;
  const pullbackLevel = (sniper?.gates?.trendBullish && ma50 != null && Number.isFinite(price) && ma50 < price) ? round2(ma50) : null;
  return {
    current: price,
    idealEntryLow: round2(pivot * 0.99),
    idealEntryHigh: round2(pivot * 1.03),
    aggressiveEntry: Number.isFinite(price) && price < pivot ? round2(price) : null,
    breakoutEntry: round2(pivot),
    pullbackLevel,
    invalidation: stop,
    target,
    rr: Number.isFinite(sniper?.rr) ? sniper.rr : null,
  };
}

// ---- Buy Price — one clear headline collapsing the Price-to-Pay
// framework + Cortex Verdict into a single real answer (explicit user
// request, 2026-08-11: "when i search give me the price to buy for this
// stock to make money easily"). Still 100% derived from the same real
// pivot/stop/target numbers above — this just picks ONE number/range and
// says it plainly, instead of making the user read a 6-field table. Never
// invents a "good" price when the real setup doesn't support one — AVOID/
// OVEREXTENDED honestly say there isn't a good buy price right now.
export function summarizeBuyPrice(priceToPay, verdict, sniper, aplusScore) {
  if (!priceToPay) return { label: "DATA UNAVAILABLE", reason: "No real pivot detected for this symbol." };
  const { current, idealEntryLow, idealEntryHigh, breakoutEntry, target, rr, aggressiveEntry, pullbackLevel } = priceToPay;
  const rrTxt = rr != null ? ` · ${rr.toFixed(1)}:1 reward/risk` : "";
  const targetTxt = target != null ? ` toward $${target}` : "";

  // A pivot/breakout price exists mathematically for almost any stock
  // (it's just the recent swing high) — that doesn't mean it's a real
  // setup worth planning around. "WAIT" covers two very different real
  // situations: a strong stock that hasn't confirmed its breakout yet
  // (worth a price target), and a genuinely weak stock with no real edge
  // (a price target here would overstate how real the setup is). Real
  // user report, 2026-08-12: GOOGL at A+ 28/100, unconfirmed trend, RS 29
  // still showed a specific breakout price as if it were a real target.
  const trendWeak = sniper?.gates?.trendBullish === false;
  const scoreWeak = Number.isFinite(aplusScore) && aplusScore < 45;

  let result;
  if (verdict?.verdict === "AVOID") {
    result = { label: "NOT A BUY RIGHT NOW", ok: false, reason: verdict.reason };
  } else if (verdict?.verdict === "OVEREXTENDED") {
    result = { label: `WAIT FOR $${idealEntryLow} – $${idealEntryHigh}`, ok: false, reason: "Price already ran — buying here has poor reward/risk. Let it come back to the real buy zone first." };
  } else if (verdict?.verdict === "WAIT" && trendWeak && scoreWeak) {
    result = { label: "NO CLEAR SETUP YET", ok: false, reason: `Trend and quality aren't established (A+ ${aplusScore}/100) — a breakout level exists mathematically ($${breakoutEntry}), but there's no real edge to plan around yet. Revisit once the trend actually confirms.` };
  } else {
    const inZone = Number.isFinite(current) && current >= idealEntryLow && current <= breakoutEntry * 1.03;
    if (inZone && verdict?.verdict === "BUY ZONE") {
      result = { label: `$${current.toFixed(2)} (right now)`, ok: true, reason: `In the real buy zone${targetTxt}${rrTxt}.` };
    } else {
      result = { label: `$${idealEntryLow} – $${idealEntryHigh}`, ok: true, reason: `Real breakout buy zone (pivot $${breakoutEntry})${targetTxt}${rrTxt} — not there yet.` };
    }
  }

  // "Buy lower" alternative (explicit user request, 2026-08-12: "i would
  // like to buy low any ideas") — a real, different-style option shown
  // alongside the breakout zone above, never fabricated: either today's
  // real price (when it's genuinely below the pivot, i.e. before
  // breakout) or a real pullback support level (50-day MA) in a confirmed
  // uptrend. Skipped entirely when there's no real setup to begin with
  // (result.ok === false) — a "cheaper" price on a weak stock isn't a
  // real opportunity either.
  if (result.ok !== false) {
    if (aggressiveEntry != null) {
      result.lowerOption = { label: `$${aggressiveEntry.toFixed(2)}`, reason: "Buy now, before the breakout confirms — cheaper, but no volume confirmation yet (more risk of a false start)." };
    } else if (pullbackLevel != null) {
      result.lowerOption = { label: `$${pullbackLevel}`, reason: "Real pullback level (50-day MA) in a confirmed uptrend — cheaper than the breakout zone if it pulls back here first." };
    }
  }

  return result;
}

// ---- WHY evidence — real reasons already generated by the Sniper Decision
// and A+ Score engines, just merged and deduped for the "WHY?" expander. ----
export function whyEvidence(sniper, aplus) {
  // Real crash fix (2026-08-12): sniper.reasons (src/sniper-decision.js)
  // is an array of {ok, text} objects, NOT plain strings like
  // aplus.reasons (market-helpers.js) — rendering the raw object crashed
  // React ("Objects are not valid as a React child"). Normalize both
  // shapes to plain strings here so this stays a display-only concern.
  const sniperReasons = (sniper?.reasons || []).map((r) => (typeof r === "string" ? r : r?.text)).filter(Boolean);
  const list = [...sniperReasons, ...(aplus?.reasons || [])];
  return [...new Set(list)].slice(0, 8);
}

// ---- Technical Score — a distinct, transparent 0-100 read of ONLY the
// real technical facts already shown in SETUP (trend/RS/volume/ADX), not
// a re-blend of regime/risk/breakout like A+ Score. Explicit user request,
// 2026-08-12: "i want... technical score and fundamental score" — kept
// deliberately simple (4 real inputs, disclosed weights) so it reads as
// "the same facts above, totaled" rather than an 8th mystery number.
export function computeTechnicalScore(row, sniper) {
  const parts = [];
  parts.push(sniper?.gates?.trendBullish ? 30 : 0);
  const rs = Number(row?.rsRating);
  parts.push(Number.isFinite(rs) ? Math.round(clamp(rs / 100, 0, 1) * 30) : 15);
  parts.push(sniper?.gates?.volumeConfirmed ? 20 : 0);
  const adx = row?.technicals?.adx;
  parts.push(
    adx?.strength === "Strong" && adx?.direction === "Bullish" ? 20
      : adx?.strength === "Developing" && adx?.direction === "Bullish" ? 12
      : adx ? 5 : 10
  );
  return Math.round(parts.reduce((a, b) => a + b, 0));
}

// ---- Trim Signal — a real, distinct "start scaling out" read, separate
// from full exit. Explicit user request, 2026-08-12: "when i expect to
// start trimming." Reuses the same real target1 (first scale-out level)
// Sniper Decision already computes, plus the same real reversal/heat
// signals — no new price model.
export function computeTrimSignal(row, sniper, heat) {
  const target1 = Number.isFinite(sniper?.target1) ? sniper.target1 : null;
  const price = Number.isFinite(row?.price) ? row.price : null;
  if (target1 == null || price == null) return { label: "DATA UNAVAILABLE", reason: "No real target level to trim into yet." };

  if (heat?.state === "CLIMACTIC_DANGER") {
    return { label: "TRIM NOW", urgent: true, reason: `Real exhaustion signals present — take partial profits regardless of target: ${heat.reason}` };
  }
  if (price >= target1) {
    return { label: `PAST $${target1.toFixed(2)} — TRIM DUE`, urgent: true, reason: "Price has reached the first real target — the platform's own convention is scaling out 50% here, trailing the rest." };
  }
  const pctToTarget1 = ((target1 - price) / price) * 100;
  return { label: `$${target1.toFixed(2)} (+${pctToTarget1.toFixed(1)}% away)`, urgent: false, reason: "Real first scale-out level — not there yet." };
}

// ---- Premium-Justified read — a real cross-check between how much the
// business is growing (GROWTH_SCORE) and how expensive it is (VALUE_SCORE/
// fair-value zone), the same "never confuse good company with good stock
// price" logic from the Future/Value engine, phrased as a direct answer
// to "can I pay premium." Only real scores already computed — no new
// valuation model.
export function computePremiumRead(futureValue) {
  if (!futureValue) return null;
  const growth = futureValue.growthScore;
  const zone = futureValue.fairValue?.zone;
  if (growth == null) return { verdict: "UNKNOWN", reason: "No real growth data to judge whether a premium is justified." };
  if (zone === "TOO_EXPENSIVE" && growth >= 65) {
    return { verdict: "MAYBE — GROWTH-JUSTIFIED, BUT PRICEY", reason: `Real durable growth (${growth}/100) can justify some premium, but the price is already above real analyst fair value — you'd be paying for growth that isn't guaranteed to keep compounding.` };
  }
  if (zone === "TOO_EXPENSIVE" && growth < 45) {
    return { verdict: "NO", reason: `Priced above real fair value with weak real growth (${growth}/100) to justify it — this isn't a "pay up for quality" situation.` };
  }
  if (zone === "IDEAL_BUY_ZONE" || zone === "ACCEPTABLE") {
    return { verdict: "N/A — NOT PRICED AT A PREMIUM", reason: "Real price is already at or below real analyst fair value — there's no premium to justify." };
  }
  return { verdict: "UNKNOWN", reason: "No real analyst price-target coverage to judge premium vs. fair value." };
}

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

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
