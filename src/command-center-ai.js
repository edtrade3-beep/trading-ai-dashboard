// command-center-ai.js — AI Market Command Center synthesis.
//
// Same architecture as ceo-ai.js/advisor-ai.js: reuse what other AI
// departments already computed rather than re-deriving it. Advisor AI's
// persisted brief already contains real trade ideas (topOpportunities/
// topRisks, each backed by this platform's own trend-template scan), a
// real risk breakdown (riskCommandCenter: concentration/beta/credit/
// currency/rate risk), real sector/macro capital flow, and real scenario
// probabilities — none of that is rebuilt here, just reused. CEO AI's
// daily verdict is reused the same way.
//
// The genuinely new work is exactly two things nothing else in this app
// does: (1) a classified event feed — real web-search-grounded news/macro/
// political events tagged with category/severity/confidence/duration/
// affected sectors, with a separate rhetoric-vs-confirmed-policy read for
// political statements (never treating a statement as certain market-
// mover), and directional (not fabricated-precise) per-asset impact tags;
// (2) real entry/stop/target price levels + position sizing attached to
// the reused top ideas, each logged into predictions-store.js so
// prediction-tracker.js can grade real outcomes over time.
//
// "Monitor Reuters/Bloomberg/Fed/Treasury/SEC/White House/Truth Social/X/
// IMF/World Bank/OPEC/ECB/BOJ/PBOC" — implemented as real Claude web_search
// grounding (which surfaces real news coverage of statements/events from
// those sources), not direct paid subscriptions to each outlet
// individually. Same constraint advisor-ai.js's own header already
// documents for its smaller version of this exact problem. Every event/
// number below is either real (re-attached server-side) or an AI-written,
// clearly-scoped classification of something the model actually searched
// for — never invented.
const { callAnthropicWithSearch } = require("./anthropic");
const { saveCoachOutput, loadCoachLog } = require("./ai-coach-store");
const { logPrediction, getTrackRecord } = require("./predictions-store");
const { computeRiskLab } = require("./risk-lab-calc");
const { sizePositionByRisk } = require("./risk-guardrails");
const { fetchYahooBars } = require("./providers/yahoo");
const { PORT } = require("./config");

const KEY = () => (process.env.ANTHROPIC_API_KEY || "").trim();
const BASE = () => process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;
async function getJson(path) {
  try { const r = await fetch(`${BASE()}${path}`); return await r.json(); } catch { return null; }
}

const row2 = (n) => Math.round(Number(n) * 100) / 100;

const EVENT_CATEGORIES = [
  "Fed", "inflation", "tariffs", "taxes", "war", "sanctions", "AI",
  "semiconductors", "energy", "healthcare", "banking", "crypto",
  "elections", "earnings", "other",
];
const ASSET_TAGS = ["spy", "qqq", "dia", "iwm", "vix", "dxy", "gold", "oil", "btc"];

function sanitizeAssetImpact(raw) {
  const out = {};
  for (const k of ASSET_TAGS) {
    const v = raw?.[k];
    const dir = ["up", "down", "neutral"].includes(v?.direction) ? v.direction : "neutral";
    const mag = ["high", "medium", "low"].includes(v?.magnitude) ? v.magnitude : "low";
    out[k] = { direction: dir, magnitude: mag };
  }
  return out;
}

function sanitizeEvents(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 10).map((e) => {
    const category = EVENT_CATEGORIES.includes(e?.category) ? e.category : "other";
    const isPolitical = !!e?.political;
    return {
      headline: String(e?.headline || "").slice(0, 160),
      category,
      severity: Math.max(1, Math.min(10, Math.round(Number(e?.severity) || 1))),
      confidence: Math.max(0, Math.min(100, Math.round(Number(e?.confidence) || 0))),
      expectedDurationDays: Number.isFinite(Number(e?.expectedDurationDays)) ? Math.max(0, Math.round(Number(e.expectedDurationDays))) : null,
      affectedSectors: (Array.isArray(e?.affectedSectors) ? e.affectedSectors : []).slice(0, 6).map(String),
      political: isPolitical,
      statementType: isPolitical && ["rhetoric", "proposed_policy", "confirmed_policy"].includes(e?.statementType) ? e.statementType : (isPolitical ? "rhetoric" : null),
      implementationProbabilityPct: isPolitical && Number.isFinite(Number(e?.implementationProbabilityPct)) ? Math.max(0, Math.min(100, Math.round(Number(e.implementationProbabilityPct)))) : null,
      historicalAnalog: e?.historicalAnalog ? String(e.historicalAnalog).slice(0, 200) : null,
      assetImpact: sanitizeAssetImpact(e?.assetImpact),
      summary: String(e?.summary || "").slice(0, 400),
    };
  }).filter((e) => e.headline);
}

// Real entry/stop/target for a handful of symbols (topOpportunities/
// topRisks only carry symbol/action/score/reason — no price levels), via
// the same real trend-screen endpoint every other real-setup surface in
// this app already uses. Bounded to a small symbol list, not a fresh
// 90-symbol scan.
async function fetchPriceLevels(symbols) {
  if (!symbols.length) return new Map();
  const screen = await getJson(`/api/market/trend-screen?symbols=${symbols.join(",")}`);
  const map = new Map();
  for (const r of screen?.results || []) {
    if (r && !r.error && Number.isFinite(r.entry) && Number.isFinite(r.stop)) map.set(r.symbol, r);
  }
  return map;
}

function buildTradeCard(pick, levels, equity, availCash, direction, aiNotes) {
  const row = levels.get(pick.symbol);
  if (!row) return null; // no real price levels for this symbol — drop rather than show a card with fabricated numbers
  const qty = equity > 0 ? sizePositionByRisk({ equity, riskPct: 1, entry: row.entry, stop: row.stop, availCash, maxNamePct: 20 }) : null;
  const notes = aiNotes?.[pick.symbol] || {};
  return {
    symbol: pick.symbol,
    direction,
    confidence: pick.confidence?.composite ?? pick.score ?? null,
    confidenceBasedOn: pick.confidence?.basedOn || null,
    confidenceNotCovered: pick.confidence?.notCovered || null,
    entry: row.entry,
    stop: row.stop,
    target1: row.target2 ? row2(row.entry + (row.target2 - row.entry) * 0.5) : null,
    target2: row.target2 ?? null,
    holdingPeriod: "Swing — 1 to 4 weeks (trend-template breakout horizon)",
    positionSizeShares: qty || null,
    reason: String(pick.reason || "").slice(0, 200),
    supportingEvidence: notes.evidence ? String(notes.evidence).slice(0, 300) : null,
    risks: notes.risks ? String(notes.risks).slice(0, 300) : null,
    historicalAnalog: notes.historicalAnalog ? String(notes.historicalAnalog).slice(0, 200) : null,
  };
}

async function buildCommandCenter() {
  if (!KEY()) return null;

  // loadCoachLog() directly, not the /api/ai-hub/*-brief HTTP endpoints —
  // those wrap the same data as {ok, brief:{...}}, and ceo-ai.js already
  // reads the coach log directly for this exact reason (no unwrap bug, no
  // extra self-HTTP round trip).
  const coachLogEarly = loadCoachLog();
  const advisorBrief = coachLogEarly.advisor || null;
  const ceoBrief = coachLogEarly.ceo || null;
  const [riskSnap, positions] = await Promise.all([
    getJson("/api/ai-hub/risk-snapshot"),
    getJson("/api/alpaca/positions"),
  ]);
  if (!advisorBrief) return null; // no real market data to synthesize — don't fabricate a run

  // Real portfolio VaR (dollar downside), on top of Advisor's already-real
  // qualitative riskCommandCenter (concentration/beta/credit/currency/rate).
  const posArr = Array.isArray(positions?.positions) ? positions.positions : [];
  let riskLab = null;
  if (posArr.length) {
    const barsArr = await Promise.all(posArr.map((p) => fetchYahooBars(p.symbol, "3mo", "1d").catch(() => [])));
    const barsBySymbol = {};
    posArr.forEach((p, i) => { barsBySymbol[p.symbol] = barsArr[i]; });
    riskLab = computeRiskLab(
      posArr.map((p) => ({ symbol: p.symbol, shares: Number(p.qty || 0), currentPrice: Number(p.current || 0), avgCost: Number(p.avgEntry || 0) })),
      barsBySymbol
    );
  }

  const topOpportunities = advisorBrief.ceoBrief?.topOpportunities || [];
  // "avoid" entries are new-money bearish calls (this desk's own trend-
  // screen scored them poorly); "portfolio"-type entries are REDUCE/SELL
  // calls on an existing holding (position management, not a fresh
  // directional idea with real levels to grade against) — only "avoid"
  // ones become bearish trade cards here.
  const bearishCandidates = (advisorBrief.ceoBrief?.topRisks || []).filter((r) => r.type === "avoid");
  const wantedSymbols = [...new Set([...topOpportunities.map((o) => o.symbol), ...bearishCandidates.map((r) => r.symbol)])].slice(0, 16);
  const levels = await fetchPriceLevels(wantedSymbols);

  // Already-persisted, already-generated AI takes — free reuse, same
  // "already-persisted output" cost discipline ceo-ai.js documents.
  const institutional = {
    insider: coachLogEarly?.insiderAiTake?.overallTake || null,
    darkPool: coachLogEarly?.darkpoolAiTake?.overallTake || null,
    shortChanges: coachLogEarly?.shortChangesAiTake?.overallTake || null,
  };

  const regime = advisorBrief.regime;
  const capitalFlow = advisorBrief.capitalFlow || [];
  const riskCC = advisorBrief.riskCommandCenter || {};

  const SYSTEM = `You are the event-intelligence layer of an AI Market Command Center for a real trading desk. Your ONLY job is two things:

1. Search real, current news/macro/political sources (Fed, Treasury, SEC filings, White House, Reuters/Bloomberg/CNBC coverage, OPEC/ECB/BOJ/PBOC, earnings) and return a classified event feed — up to 8 of the most market-relevant real events from the last 24-72 hours. For EVERY event you must classify: category (one of ${EVENT_CATEGORIES.join("/")}), severity 1-10, your confidence 0-100 that this genuinely matters for markets, expectedDurationDays (how long the effect plausibly persists), affectedSectors (array of sector names), and assetImpact — for spy/qqq/dia/iwm/vix/dxy/gold/oil/btc, a DIRECTION (up/down/neutral) and MAGNITUDE (high/medium/low) only, NEVER a fabricated precise percentage.

2. For POLITICAL statements specifically (Trump or any political figure) — do NOT assume every statement moves markets. Set political:true and statementType to exactly one of "rhetoric" (talk, no concrete proposal), "proposed_policy" (a specific proposal, not yet law/order), or "confirmed_policy" (actually signed/enacted/implemented). Give implementationProbabilityPct (0-100, your honest estimate the rhetoric/proposal actually becomes real policy) and a one-line historicalAnalog to a similar past case if a genuinely relevant one exists (omit rather than force a weak comparison).

You will also be given this desk's own real, already-computed trading ideas (topOpportunities/bearishCandidates, each backed by this platform's own trend-template scan — real entry/stop/target price levels are attached server-side, you never need to invent them) and real portfolio risk data. For each idea, write ONLY the prose (evidence/risks/historicalAnalog) — 1-2 sentences each, grounded in the real score/RS/stage data given, or your real search results if genuinely relevant. Never invent a number for these — if you don't have real grounding for a claim, omit it rather than guess.

Also write ONE executiveSummary (3-5 sentences) synthesizing: today's real regime, the event feed you just built, and this desk's real risk exposure. Be honest about uncertainty — use probability language, never false certainty.

Return JSON ONLY, no text outside it:
{"events":[{"headline":"...","category":"...","severity":1-10,"confidence":0-100,"expectedDurationDays":N,"affectedSectors":["..."],"political":bool,"statementType":"rhetoric|proposed_policy|confirmed_policy or omit if not political","implementationProbabilityPct":0-100 or omit,"historicalAnalog":"..." or omit,"assetImpact":{"spy":{"direction":"up|down|neutral","magnitude":"high|medium|low"},"qqq":{...},"dia":{...},"iwm":{...},"vix":{...},"dxy":{...},"gold":{...},"oil":{...},"btc":{...}},"summary":"1-2 sentences"}],"tradeNotes":{"TICKER":{"evidence":"...","risks":"...","historicalAnalog":"..." or omit}},"executiveSummary":"..."}`;

  const prompt = `TODAY'S REAL MARKET REGIME: ${regime?.label} (${regime?.score}/100).
CAPITAL FLOW (real, today vs SPY): ${capitalFlow.slice(0, 6).map((c) => `${c.symbol} ${c.chg >= 0 ? "+" : ""}${c.chg?.toFixed?.(2)}%`).join(", ") || "unavailable"}
PORTFOLIO RISK (real): concentration ${riskCC.concentrationRisk || "n/a"}, volatility ${riskCC.volatilityRisk || "n/a"} (beta ${riskCC.weightedBeta ?? "n/a"}), credit ${riskCC.creditRisk || "n/a"}, currency ${riskCC.currencyRisk || "n/a"}, rates ${riskCC.interestRateRisk || "n/a"}${riskLab ? `, portfolio VaR95 $${riskLab.var95}` : ""}.

THIS DESK'S REAL BULLISH IDEAS (write evidence/risks/historicalAnalog for these tickers in tradeNotes):
${topOpportunities.map((o) => `${o.symbol} ${o.action} — score ${o.score}, reason: ${o.reason}`).join("\n") || "none today"}

THIS DESK'S REAL BEARISH/AVOID IDEAS (write evidence/risks/historicalAnalog for these tickers in tradeNotes):
${bearishCandidates.map((r) => `${r.symbol} — ${r.reason}`).join("\n") || "none today"}

ALREADY-GENERATED INSTITUTIONAL ACTIVITY READS (reference in your executiveSummary if genuinely relevant, don't force it):
${institutional.insider ? `Insider: ${String(institutional.insider).slice(0, 300)}` : "Insider: none generated yet"}
${institutional.darkPool ? `Dark Pool: ${String(institutional.darkPool).slice(0, 300)}` : "Dark Pool: none generated yet"}
${institutional.shortChanges ? `Short Interest: ${String(institutional.shortChanges).slice(0, 300)}` : "Short Interest: none generated yet"}

${ceoBrief ? `TODAY'S CEO AI CALL: ${ceoBrief.verdict} (confidence ${ceoBrief.confidence})` : ""}

Search for real, current news now and return the JSON.`;

  let parsed;
  try {
    // callAnthropicWithSearch has no separate `system` param — same
    // prompt+"\n\n"+system concatenation advisor-ai.js already uses for
    // this exact function.
    const raw = await callAnthropicWithSearch(prompt + "\n\n" + SYSTEM, KEY(), { model: "claude-sonnet-4-6", maxTokens: 5000, maxSearches: 6 });
    const m = (raw || "").match(/\{[\s\S]*\}/);
    parsed = JSON.parse(m ? m[0] : raw);
  } catch {
    return null;
  }
  if (!parsed) return null;

  const events = sanitizeEvents(parsed.events);
  const tradeNotes = parsed.tradeNotes && typeof parsed.tradeNotes === "object" ? parsed.tradeNotes : {};

  const equity = Number(riskSnap?.equity || 0);
  const availCash = Number(riskSnap?.cash || 0);
  const bullishCards = topOpportunities.map((o) => buildTradeCard(o, levels, equity, availCash, "LONG", tradeNotes)).filter(Boolean).slice(0, 5);
  const bearishCards = bearishCandidates.map((r) => buildTradeCard(r, levels, equity, availCash, "SHORT/AVOID", tradeNotes)).filter(Boolean).slice(0, 5);

  // Log each real trade idea into the predictions ledger (deduped per
  // symbol+direction+day so repeated manual refreshes don't spam the
  // ledger with the same idea over and over).
  const today = new Date().toISOString().slice(0, 10);
  [...bullishCards, ...bearishCards].forEach((card) => {
    try {
      logPrediction({
        symbol: card.symbol, direction: card.direction, entry: card.entry, stop: card.stop,
        target1: card.target1, target2: card.target2, confidence: card.confidence,
        holdingPeriodDays: 20, generatedAt: `${today}T00:00:00.000Z`,
      });
    } catch { /* non-fatal — track record just won't include this one */ }
  });

  const built = {
    regime,
    executiveSummary: String(parsed.executiveSummary || "").slice(0, 1200),
    events,
    bullishIdeas: bullishCards,
    bearishIdeas: bearishCards,
    sectorRotation: capitalFlow,
    institutional,
    portfolioRisk: { ...riskCC, ...(riskLab ? { var95: riskLab.var95, var99: riskLab.var99, portfolioValue: riskLab.totalValue } : {}) },
    scenarios: advisorBrief.scenarios || null,
    ceoVerdict: ceoBrief ? { verdict: ceoBrief.verdict, confidence: ceoBrief.confidence, biggestRisk: ceoBrief.biggestRisk, flipCondition: ceoBrief.flipCondition } : null,
    trackRecord: getTrackRecord(),
    generatedAt: Date.now(),
  };
  saveCoachOutput("commandCenter", built);
  return built;
}

module.exports = { buildCommandCenter };
