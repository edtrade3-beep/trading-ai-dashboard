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
const { getMostRecentEntry, appendSnapshot } = require("./command-center-history-store");
const { computeRiskLab } = require("./risk-lab-calc");
const { sizePositionByRisk } = require("./risk-guardrails");
const { fetchYahooBars } = require("./providers/yahoo");
const { sendTelegramMessage, isConfigured: telegramConfigured } = require("./telegram");
const { shouldSendAlert } = require("./telegram-bot");
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

function buildTradeCard(pick, levels, equity, availCash, direction, aiNotes, holdingsMap) {
  const row = levels.get(pick.symbol);
  if (!row) return null; // no real price levels for this symbol — drop rather than show a card with fabricated numbers
  const qty = equity > 0 ? sizePositionByRisk({ equity, riskPct: 1, entry: row.entry, stop: row.stop, availCash, maxNamePct: 20 }) : null;
  const notes = aiNotes?.[pick.symbol] || {};
  // Already-held flag — real portfolio position, not a guess. A bullish
  // idea on a name already in the book is an "add" decision, not a fresh
  // entry; a bearish/avoid idea on a held name is a genuine live conflict
  // worth surfacing rather than presenting as if the book were empty.
  const holding = holdingsMap?.get(pick.symbol) || null;
  return {
    symbol: pick.symbol,
    direction,
    confidence: pick.confidence?.composite ?? pick.score ?? null,
    // Real deterministic sub-scores (already computed by advisor-ai.js's
    // computeConfidence — technical off this platform's own trend-template
    // scan, fundamental off real Yahoo growth/margin/valuation/leverage
    // fields, smartMoney off real insider/short-interest data, portfolioFit
    // off real sector concentration), previously only surfaced as a label
    // list — exposed here as the real numbers so the score reads like a
    // formula, not an AI opinion.
    confidenceScorecard: {
      technical: pick.confidence?.technical ?? null,
      fundamental: pick.confidence?.fundamental ?? null,
      smartMoney: pick.confidence?.smartMoney ?? null,
      portfolioFit: pick.confidence?.portfolioFit ?? null,
    },
    confidenceNotCovered: pick.confidence?.notCovered || null,
    // Real trend-template scan output (this platform's own deterministic
    // 8-point system) — the actual rule-based facts the trade idea is
    // grounded in, not AI-summarized.
    passCount: Number.isFinite(row.passCount) ? row.passCount : null,
    rsRating: Number.isFinite(row.rsRating) ? row.rsRating : null,
    stage: row.stage ? String(row.stage).replace(/ —.*/, "") : null,
    entry: row.entry,
    stop: row.stop,
    target1: row.target2 ? row2(row.entry + (row.target2 - row.entry) * 0.5) : null,
    target2: row.target2 ?? null,
    holdingPeriod: "Swing — 1 to 4 weeks (trend-template breakout horizon)",
    positionSizeShares: qty || null,
    reason: String(pick.reason || "").slice(0, 140),
    supportingEvidence: notes.evidence ? String(notes.evidence).slice(0, 160) : null,
    risks: notes.risks ? String(notes.risks).slice(0, 160) : null,
    historicalAnalog: notes.historicalAnalog ? String(notes.historicalAnalog).slice(0, 120) : null,
    held: !!holding,
    heldWeightPct: holding?.weightPct ?? null,
    heldUnrealizedPLpc: holding?.unrealizedPLpc ?? null,
  };
}

// Composite 0-100 "Command Score" — a transparent blend of three real
// numbers already computed elsewhere (never a new invented sub-score):
// today's real regime score, CEO AI's own confidence tier (mapped to a
// number), and the average confidence across today's real trade ideas.
// Any part that isn't available is simply excluded from the average,
// same "don't guess a neutral value" discipline advisor-ai.js's own
// confidence engine already uses.
function computeCommandScore(regimeScore, ceoConfidence, ideas, breadthAbove50Pct, sentimentScore) {
  const ceoMap = { HIGH: 85, MEDIUM: 55, LOW: 25 };
  const ideaConfidences = ideas.map((i) => i.confidence).filter((c) => Number.isFinite(c));
  const ideaAvg = ideaConfidences.length ? Math.round(ideaConfidences.reduce((a, b) => a + b, 0) / ideaConfidences.length) : null;
  const inputs = [
    { label: "Regime", value: Number.isFinite(regimeScore) ? regimeScore : null },
    { label: "CEO AI Confidence", value: ceoConfidence && ceoMap[ceoConfidence] != null ? ceoMap[ceoConfidence] : null },
    { label: "Avg Idea Confidence", value: ideaAvg },
    // Real breadth % (already 0-100) and Fear&Greed score (already 0-100)
    // — both from free, already-shipped endpoints, no new AI call.
    { label: "Breadth", value: Number.isFinite(breadthAbove50Pct) ? breadthAbove50Pct : null },
    { label: "Fear/Greed", value: Number.isFinite(sentimentScore) ? sentimentScore : null },
  ];
  const used = inputs.filter((i) => i.value != null);
  const score = used.length ? Math.round(used.reduce((a, i) => a + i.value, 0) / used.length) : null;
  // Each used input's real equal weight (e.g. 3 inputs -> 33% each) — shown
  // so the score reads as a formula with visible inputs, not a black-box
  // AI opinion.
  return { score, inputs: inputs.map((i) => ({ ...i, weightPct: i.value != null ? Math.round(100 / used.length) : null })) };
}

// Real, rule-based divergence checks — deterministic, not AI judgment,
// matching this app's "algorithmic scoring" preference established
// earlier this session for Command Score's redesign. Each flag is a real
// boolean check against real data already gathered (regime, riskCC,
// breadth, distribution, feargreed — none of it AI-derived); omitted
// entirely (not forced) when nothing actually diverges.
function buildDivergenceFlags(regime, riskCC, breadth, distribution, feargreed) {
  const flags = [];
  const breadthAbove50 = breadth?.summary?.above50Pct;
  const vixRegime = regime?.detail?.volRegime;

  if (riskCC.creditRisk === "ELEVATED" && regime?.label === "GREEN") {
    flags.push({ flag: "Credit risk elevated while regime reads GREEN", detail: `HYG day-change flags ELEVATED credit risk (${riskCC.creditHygChgPct ?? "?"}%), but regime hasn't turned yet — an early-warning signal price hasn't reflected.` });
  }
  if (Number.isFinite(breadthAbove50) && breadthAbove50 < 50 && regime?.label !== "RED") {
    flags.push({ flag: "Weak breadth under a non-RED regime", detail: `Only ${breadthAbove50}% of sectors are above their 50-day MA while regime still reads ${regime?.label} — weakening internals under the index.` });
  }
  if (feargreed?.label && /GREED/.test(feargreed.label) && vixRegime && ["Elevated", "Panic"].includes(vixRegime)) {
    flags.push({ flag: "Greed sentiment against an elevated VIX regime", detail: `Fear & Greed reads ${feargreed.label} (${feargreed.score}/100) while the VIX regime is ${vixRegime} — a real contradiction between sentiment and volatility.` });
  }
  if (distribution && (distribution.riskScore >= 70 || distribution.alert === "DANGER") && regime?.label === "GREEN") {
    flags.push({ flag: "High distribution-day risk under a GREEN regime", detail: `Distribution-day risk score ${distribution.riskScore}/100 (${distribution.alert}) while regime still reads GREEN.` });
  }
  return flags;
}

// Real, transparent risk-flag COUNT — deliberately not a fabricated
// crash/correction probability. No calibrated statistical model can
// honestly be built from the ~5 years of real historical data this app
// has access to (same constraint advisor-ai.js's buildScenarios already
// documents for its own best/base/worst-case percentages). Each flag is
// a real boolean check against a real number, shown alongside the count
// so it reads as a formula with visible inputs, not an AI opinion.
function buildRiskFlags(regime, riskCC, breadth, distribution) {
  const checks = [
    { label: "VIX regime elevated", triggered: ["Elevated", "Panic"].includes(regime?.detail?.volRegime), detail: regime?.detail?.volRegime || "n/a" },
    { label: "Credit risk elevated", triggered: riskCC.creditRisk === "ELEVATED", detail: riskCC.creditRisk || "n/a" },
    { label: "Breadth <50% above 50-day MA", triggered: Number.isFinite(breadth?.summary?.above50Pct) && breadth.summary.above50Pct < 50, detail: breadth?.summary?.above50Pct != null ? `${breadth.summary.above50Pct}%` : "n/a" },
    { label: "Advance/decline ratio <1 today", triggered: Number.isFinite(breadth?.summary?.adRatio) && breadth.summary.adRatio < 1, detail: breadth?.summary?.adRatio ?? "n/a" },
    { label: "Distribution-day risk high", triggered: !!distribution && (distribution.riskScore >= 70 || distribution.alert === "DANGER"), detail: distribution ? `${distribution.riskScore}/100 (${distribution.alert})` : "n/a" },
    { label: "Defensive sector rotation", triggered: !!distribution && Number.isFinite(distribution.rotationDiff) && distribution.rotationDiff > 0, detail: distribution?.rotationDiff != null ? `${distribution.rotationDiff}%` : "n/a" },
  ];
  const triggeredCount = checks.filter((c) => c.triggered).length;
  return { triggeredCount, total: checks.length, checks };
}

// Real diff against the immediately-prior generation (whether that was
// minutes ago or days ago) — never fabricated, and explicitly null (not a
// misleading "no change") on the very first-ever generation, when there's
// nothing real to compare against.
function buildWhatChanged(prev, current) {
  if (!prev) return null;
  const changes = [];
  if (Number.isFinite(prev.commandScore) && Number.isFinite(current.commandScore) && prev.commandScore !== current.commandScore) {
    changes.push({ label: "Command Score", from: prev.commandScore, to: current.commandScore, delta: current.commandScore - prev.commandScore });
  }
  if (Number.isFinite(prev.regimeScore) && Number.isFinite(current.regimeScore) && prev.regimeScore !== current.regimeScore) {
    changes.push({ label: "Regime", from: `${prev.regimeLabel} (${prev.regimeScore})`, to: `${current.regimeLabel} (${current.regimeScore})`, delta: current.regimeScore - prev.regimeScore });
  }
  const newBullish = current.bullishSymbols.filter((s) => !(prev.bullishSymbols || []).includes(s));
  const droppedBullish = (prev.bullishSymbols || []).filter((s) => !current.bullishSymbols.includes(s));
  const newBearish = current.bearishSymbols.filter((s) => !(prev.bearishSymbols || []).includes(s));
  const droppedBearish = (prev.bearishSymbols || []).filter((s) => !current.bearishSymbols.includes(s));
  return {
    prevAt: prev.at,
    changes,
    newBullish, droppedBullish, newBearish, droppedBearish,
    criticalEventDelta: Number.isFinite(prev.criticalEventCount) ? current.criticalEventCount - prev.criticalEventCount : null,
    hitRateDelta: Number.isFinite(prev.hitRatePct) && Number.isFinite(current.hitRatePct) ? Math.round((current.hitRatePct - prev.hitRatePct) * 10) / 10 : null,
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
  // feargreed/breadth/distribution are real, already-free, already-shipped
  // endpoints (routes/market.js) — zero new AI cost, just wiring in more
  // real data this function wasn't reading before.
  const [riskSnap, positions, feargreed, breadth, distribution] = await Promise.all([
    getJson("/api/ai-hub/risk-snapshot"),
    getJson("/api/alpaca/positions"),
    getJson("/api/market/feargreed"),
    getJson("/api/market/breadth"),
    getJson("/api/market/distribution"),
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

  // Real, deterministic — computed here (not by the AI) so they're
  // available even when the AI enrichment call below fails or is
  // unavailable, same "real data doesn't depend on AI" principle as the
  // rest of this function.
  const divergenceFlags = buildDivergenceFlags(regime, riskCC, breadth, distribution, feargreed);
  const riskFlags = buildRiskFlags(regime, riskCC, breadth, distribution);

  const SYSTEM = `You are the event-intelligence layer of an AI Market Command Center for a real trading desk. Your ONLY job is two things:

1. Search real, current news/macro/political sources (Fed, Treasury, SEC filings, White House, Reuters/Bloomberg/CNBC coverage, OPEC/ECB/BOJ/PBOC, earnings) and return a classified event feed — up to 8 of the most market-relevant real events from the last 24-72 hours. For EVERY event you must classify: category (one of ${EVENT_CATEGORIES.join("/")}), severity 1-10, your confidence 0-100 that this genuinely matters for markets, expectedDurationDays (how long the effect plausibly persists), affectedSectors (array of sector names), and assetImpact — for spy/qqq/dia/iwm/vix/dxy/gold/oil/btc, a DIRECTION (up/down/neutral) and MAGNITUDE (high/medium/low) only, NEVER a fabricated precise percentage.

2. For POLITICAL statements specifically (Trump or any political figure) — do NOT assume every statement moves markets. Set political:true and statementType to exactly one of "rhetoric" (talk, no concrete proposal), "proposed_policy" (a specific proposal, not yet law/order), or "confirmed_policy" (actually signed/enacted/implemented). Give implementationProbabilityPct (0-100, your honest estimate the rhetoric/proposal actually becomes real policy) and a one-line historicalAnalog to a similar past case if a genuinely relevant one exists (omit rather than force a weak comparison).

You will also be given this desk's own real, already-computed trading ideas (topOpportunities/bearishCandidates, each backed by this platform's own trend-template scan — real entry/stop/target price levels AND the real passCount/RS/stage numbers are attached server-side, you never need to invent or restate them) and real portfolio risk data. This desk reads like a systematic scanner readout, not a narrative — for each idea's evidence/risks/historicalAnalog, write ONE short clipped fact per field (under 15 words, no filler like "reflects" or "suggesting" — a terminal readout, not an essay), grounded in real data or your real search results. Never invent a number — omit a field entirely rather than guess.

Also write ONE executiveSummary: 2-3 short clipped statements (under 20 words each), not a narrative paragraph — state the regime, the single biggest driver, and the single biggest risk, each as a blunt fact. Use probability language for genuine uncertainty, but keep it terse. Real breadth/Fear&Greed/distribution-risk/divergence-flag data is provided below, already computed server-side — reference it if it's genuinely the biggest driver/risk, don't restate every number.

Return JSON ONLY, no text outside it:
{"events":[{"headline":"...","category":"...","severity":1-10,"confidence":0-100,"expectedDurationDays":N,"affectedSectors":["..."],"political":bool,"statementType":"rhetoric|proposed_policy|confirmed_policy or omit if not political","implementationProbabilityPct":0-100 or omit,"historicalAnalog":"..." or omit,"assetImpact":{"spy":{"direction":"up|down|neutral","magnitude":"high|medium|low"},"qqq":{...},"dia":{...},"iwm":{...},"vix":{...},"dxy":{...},"gold":{...},"oil":{...},"btc":{...}},"summary":"one clipped fact, under 15 words"}],"tradeNotes":{"TICKER":{"evidence":"one clipped fact, under 15 words","risks":"one clipped fact, under 15 words","historicalAnalog":"..." or omit}},"executiveSummary":"..."}`;

  const prompt = `TODAY'S REAL MARKET REGIME: ${regime?.label} (${regime?.score}/100).
CAPITAL FLOW (real, today vs SPY): ${capitalFlow.slice(0, 6).map((c) => `${c.symbol} ${c.chg >= 0 ? "+" : ""}${c.chg?.toFixed?.(2)}%`).join(", ") || "unavailable"}
PORTFOLIO RISK (real): concentration ${riskCC.concentrationRisk || "n/a"}, volatility ${riskCC.volatilityRisk || "n/a"} (beta ${riskCC.weightedBeta ?? "n/a"}), credit ${riskCC.creditRisk || "n/a"}, currency ${riskCC.currencyRisk || "n/a"}, rates ${riskCC.interestRateRisk || "n/a"}${riskLab ? `, portfolio VaR95 $${riskLab.var95}` : ""}.
MARKET BREADTH (real): ${breadth?.summary ? `${breadth.summary.above50Pct}% of sectors above 50-day MA, ${breadth.summary.above200Pct}% above 200-day MA, advance/decline ratio ${breadth.summary.adRatio}` : "unavailable"}.
FEAR & GREED (real): ${feargreed ? `${feargreed.score}/100 (${feargreed.label})` : "unavailable"}.
DISTRIBUTION-DAY RISK (real): ${distribution ? `${distribution.riskScore}/100 (${distribution.alert})` : "unavailable"}.
REAL DIVERGENCE FLAGS (already detected server-side, reference in executiveSummary if genuinely the biggest risk/driver — don't repeat all of them, just the most important one if any): ${divergenceFlags.length ? divergenceFlags.map((d) => d.flag).join("; ") : "none detected"}
REAL RISK-FLAG COUNT (deterministic, not a prediction): ${riskFlags.triggeredCount} of ${riskFlags.total} triggered.

THIS DESK'S REAL BULLISH IDEAS (write evidence/risks/historicalAnalog for these tickers in tradeNotes):
${topOpportunities.map((o) => `${o.symbol} ${o.action} — score ${o.score}, reason: ${o.reason}`).join("\n") || "none today"}

THIS DESK'S REAL BEARISH/AVOID IDEAS (write evidence/risks/historicalAnalog for these tickers in tradeNotes):
${bearishCandidates.map((r) => `${r.symbol} — ${r.reason}`).join("\n") || "none today"}

ALREADY-GENERATED INSTITUTIONAL ACTIVITY READS (reference in your executiveSummary if genuinely relevant, don't force it):
${institutional.insider ? `Insider: ${String(institutional.insider).slice(0, 300)}` : "Insider: none generated yet"}
${institutional.darkPool ? `Dark Pool: ${String(institutional.darkPool).slice(0, 300)}` : "Dark Pool: none generated yet"}
${institutional.shortChanges ? `Short Interest: ${String(institutional.shortChanges).slice(0, 300)}` : "Short Interest: none generated yet"}

${ceoBrief?.verdict ? `TODAY'S CEO AI CALL: ${ceoBrief.verdict} (confidence ${ceoBrief.confidence})` : ""}

Search for real, current news now and return the JSON.`;

  // AI enrichment (event feed, per-idea narrative notes, executive
  // summary) attempted but NOT required — everything below this point
  // (regime, real trade cards with real price levels, portfolio risk,
  // CEO verdict, trackRecord) is already-computed real data independent
  // of this call. Previously a failed/capped AI call threw and the whole
  // function returned null, so Command Center showed nothing at all
  // during an outage even though almost none of its content actually
  // needs a fresh AI call. Now: real data always builds; AI enrichment
  // layers on top only when it succeeds, and its absence is disclosed
  // honestly (aiUnavailable flag + a real-data-only executive summary)
  // rather than silently omitted or shown as stale/fabricated.
  let parsed = null;
  let aiError = null;
  try {
    // maxSearches trimmed 6->3: fewer web_search rounds means less tool-use
    // content eating into the same max_tokens budget as the final JSON —
    // cheaper AND less likely to truncate, not a tradeoff between the two.
    // Confirmed live: even 8000 tokens still failed at 6 searches (121s
    // runtime, still no valid JSON) — the search rounds themselves, not
    // just event/idea count, were the dominant cost eating the budget.
    const raw = await callAnthropicWithSearch(prompt + "\n\n" + SYSTEM, KEY(), { model: "claude-sonnet-4-6", maxTokens: 8000, maxSearches: 3 });
    const m = (raw || "").match(/\{[\s\S]*\}/);
    parsed = JSON.parse(m ? m[0] : raw);
  } catch (e) {
    aiError = e.message;
    console.warn("[Command Center] AI enrichment unavailable, falling back to real-data-only:", aiError);
  }

  // Highest severity first — a CEO reading this once, fast, sees the
  // events that matter most without having to scan the whole list.
  const events = parsed ? sanitizeEvents(parsed.events).sort((a, b) => b.severity - a.severity) : [];
  const criticalEventCount = events.filter((e) => e.severity >= 7).length;
  const tradeNotes = parsed?.tradeNotes && typeof parsed.tradeNotes === "object" ? parsed.tradeNotes : {};

  const holdingsMap = new Map((advisorBrief.portfolio?.holdings || []).map((h) => [h.symbol, h]));
  const equity = Number(riskSnap?.equity || 0);
  const availCash = Number(riskSnap?.cash || 0);
  const bullishCards = topOpportunities.map((o) => buildTradeCard(o, levels, equity, availCash, "LONG", tradeNotes, holdingsMap)).filter(Boolean).slice(0, 5);
  const bearishCards = bearishCandidates.map((r) => buildTradeCard(r, levels, equity, availCash, "SHORT/AVOID", tradeNotes, holdingsMap)).filter(Boolean).slice(0, 5);

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

  const commandScore = computeCommandScore(regime?.score, ceoBrief?.confidence, [...bullishCards, ...bearishCards], breadth?.summary?.above50Pct, feargreed?.score);
  const trackRecord = getTrackRecord();

  // Read the prior snapshot BEFORE this run's own snapshot is appended —
  // real diff against whatever was actually generated immediately before
  // this, not a fabricated "no change".
  const prevSnapshot = getMostRecentEntry();
  const currentSnapshot = {
    commandScore: commandScore.score,
    regimeScore: regime?.score ?? null,
    regimeLabel: regime?.label ?? null,
    criticalEventCount,
    bullishSymbols: bullishCards.map((c) => c.symbol),
    bearishSymbols: bearishCards.map((c) => c.symbol),
    hitRatePct: trackRecord.hitRatePct,
  };
  const whatChanged = buildWhatChanged(prevSnapshot, currentSnapshot);

  // Real-data-only fallback summary when AI enrichment failed — built
  // from real regime/idea/breadth/sentiment/risk-flag data already on
  // hand, not a fabricated narrative. Clearly labeled so it's never
  // mistaken for the AI's actual read.
  const riskFlagLine = riskFlags.triggeredCount > 0 ? ` ${riskFlags.triggeredCount} of ${riskFlags.total} real risk flags triggered.` : "";
  const divergenceLine = divergenceFlags.length ? ` Divergence: ${divergenceFlags[0].flag}.` : "";
  const fallbackSummary = `${regime?.label || "?"} regime (${regime?.score ?? "?"}/100).${feargreed ? ` Fear & Greed ${feargreed.score}/100 (${feargreed.label}).` : ""} ${bullishCards.length ? `${bullishCards.length} real bullish setup${bullishCards.length > 1 ? "s" : ""} (${bullishCards.map((c) => c.symbol).join(", ")}).` : "No qualifying bullish setups today."}${riskFlagLine}${divergenceLine} AI event feed and narrative unavailable this run — showing real computed data only.`;

  const built = {
    regime,
    commandScore,
    whatChanged,
    executiveSummary: parsed ? String(parsed.executiveSummary || "").slice(0, 500) : fallbackSummary,
    aiUnavailable: !parsed,
    aiError: aiError || null,
    events,
    criticalEventCount,
    bullishIdeas: bullishCards,
    bearishIdeas: bearishCards,
    sectorRotation: capitalFlow,
    institutional,
    portfolioRisk: { ...riskCC, ...(riskLab ? { var95: riskLab.var95, var99: riskLab.var99, portfolioValue: riskLab.totalValue } : {}) },
    // Real, free, zero-new-AI-cost data — Chief Market Strategist scope.
    breadth: breadth?.summary || null,
    sentiment: feargreed ? { score: feargreed.score, label: feargreed.label, vix: feargreed.vix } : null,
    distributionRisk: distribution ? { riskScore: distribution.riskScore, alert: distribution.alert, warnings: distribution.warnings, rotationDiff: distribution.rotationDiff } : null,
    divergenceFlags,
    riskFlags,
    // Genuinely unavailable from any free data source in this codebase —
    // disclosed honestly rather than faked. See command-center-ai.js
    // buildDivergenceFlags/buildRiskFlags comments for why.
    notCoveredFreeData: [
      "VIX term structure (contango/backwardation) — only spot VIX available",
      "Aggregate market-wide options positioning (put/call ratio, gamma exposure)",
      "Real ETF fund flows (creation/redemption) — moneyFlow above is a volume-weighted price proxy, not real flow data",
      "Decade-scale historical comparison (2000 dot-com, 2008 crisis) — real data only reaches back ~5 years",
      "Calibrated crash/correction probability — no statistically-calibrated model can honestly be built from ~5 years of data",
    ],
    scenarios: advisorBrief.scenarios || null,
    // ceoBrief can now be a real-data-only fallback (verdict:null) when
    // CEO AI's own AI call was unavailable — checking ceoBrief.verdict
    // specifically (not just ceoBrief's truthiness) so this stays real
    // null instead of a truthy {verdict:null,...} object, which would
    // otherwise render as a literal "CEO AI: null (null confidence)" in
    // the UI (brief.ceoVerdict && (...) only checks truthiness there).
    ceoVerdict: ceoBrief?.verdict ? { verdict: ceoBrief.verdict, confidence: ceoBrief.confidence, biggestRisk: ceoBrief.biggestRisk, flipCondition: ceoBrief.flipCondition } : null,
    trackRecord,
    generatedAt: Date.now(),
  };
  saveCoachOutput("commandCenter", built);
  try { appendSnapshot(currentSnapshot); } catch { /* non-fatal — next run just won't have a "what changed" comparison */ }

  // Auto-alert on generation — same server-side pattern ceo-ai.js already
  // proves out (no client /api/notify call, so it isn't gated behind the
  // API_AUTH_TOKEN this server doesn't have configured). Quiet-hours/
  // budget-respecting via shouldSendAlert, same as every other real alert
  // in this app.
  if (telegramConfigured() && shouldSendAlert({ category: "ai-coach" })) {
    const critLine = criticalEventCount ? `\n🔴 ${criticalEventCount} critical event${criticalEventCount > 1 ? "s" : ""}` : "";
    const topBull = bullishCards[0] ? `\n🟢 Top long: ${bullishCards[0].symbol} (${bullishCards[0].confidence ?? "—"}/100)` : "";
    const topBear = bearishCards[0] ? `\n🔴 Top avoid: ${bearishCards[0].symbol}` : "";
    const msg = `🛰️ *AI COMMAND CENTER*\n\n${built.regime?.label || "?"} regime (${built.regime?.score ?? "?"}/100)${built.commandScore?.score != null ? ` · Command Score ${built.commandScore.score}/100` : ""}${critLine}\n\n${built.executiveSummary.slice(0, 500)}${topBull}${topBear}`;
    sendTelegramMessage(msg).catch(() => {});
  }

  return built;
}

module.exports = { buildCommandCenter };
