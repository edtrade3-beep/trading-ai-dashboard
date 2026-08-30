// research-intel-ai.js — Search/Research tab upgrade (2026-08-30, explicit
// user spec "/upgrade-search": "UPGRADE THE EXISTING SEARCH/RESEARCH TAB.
// DO NOT CREATE A SEPARATE RESEARCH ENGINE. DO NOT DUPLICATE THE MARKET
// ENGINE."). This file is intentionally the SAME shape as
// command-center-ai.js's buildCommandCenter() — real web-search-grounded
// classification via the same callAnthropicWithSearch chokepoint, real
// diffing against yesterday via a dedicated small store, real Telegram
// alerts through the existing shouldSendAlert gate — reused, not
// reinvented, because command-center-ai.js already proved this exact
// architecture out.
//
// What's genuinely new here (not already covered by Command Center):
// 1. A distinct category axis matching the spec's own 6 research domains
//    (market/economy/fed-rates/fiscal-debt/politics-policy/technology) —
//    Command Center's EVENT_CATEGORIES is a per-story-topic list for
//    enriching this desk's OWN trade ideas, a different job.
//    research-intel-engine.js's RESEARCH_CATEGORIES is additive, not a
//    fork of that list.
// 2. A dedicated TECHNOLOGY / FUTURE-SECTOR discovery output shape
//    (technology/maturity/problemSolved/whyNow/marketSize/adoptionTimeline/
//    publicCompanies/supplyChain/winners/losers/risks) — nothing else in
//    this app produces this.
// 3. Named narrative-DIMENSION tracking (fed-policy-direction,
//    growth-inflation-regime, ai-narrative, consumer-health, fiscal-stance,
//    labor-market) with real day-over-day shift detection — Command
//    Center's regime-shift tracker covers ONE dimension (the macro-engine
//    regime label); this covers six, independently.
// 4. Explicit historical-memory status per finding (NEW/STRENGTHENED/
//    WEAKENED/INVALIDATED/UNCHANGED) — Command Center's whatChanged is a
//    numeric delta, not a per-item narrative-continuity read.
//
// What's explicitly REUSED, not duplicated: the macro/rates/credit/
// liquidity/employment/breadth/sector-rotation numbers (pulled from the
// real, already-cached /api/market/macro-regime — no new fetch of FRED/
// quotes), and this app's own real, already-scored news feed
// (src/news/store.js — high-impact SYSTEMIC_RISK/GEOPOLITICAL/MACRO/AI
// items from the last 24h) is handed to the AI as real grounding context
// so it builds on what this platform already found rather than
// re-discovering it from scratch. Per the spec's own framing, this file
// produces RESEARCH/EVIDENCE only — it has no verdict, no entry/stop/
// target, no position sizing; the existing central decision engine
// (am-core-engine.js / opportunity-engine.js) remains untouched and
// remains the thing that decides what to DO about any of this.
"use strict";

const { callAnthropicWithSearch } = require("./anthropic");
const { getMode } = require("./credit-saver-mode");
const { saveCoachOutput, loadCoachLog } = require("./ai-coach-store");
const { loadHistory, getMostRecentEntry, appendSnapshot, etDateStr } = require("./research-intel-store");
const { sendTelegramMessage, isConfigured: telegramConfigured } = require("./telegram");
const { shouldSendAlert } = require("./telegram-bot");
const { PORT } = require("./config");
const {
  NARRATIVE_DIMENSIONS, RESEARCH_CATEGORIES, CLASSIFICATIONS, DATA_QUALITIES,
  sanitizeCards, sanitizeTechDiscoveries, sanitizeNarrativeShifts, dimensionsToSnapshot,
  attachPriorClassification, computeNotificationTriggers,
} = require("./research-intel-engine");

const KEY = () => (process.env.ANTHROPIC_API_KEY || "").trim();
const BASE = () => process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;
async function getJson(path) {
  try { const r = await fetch(`${BASE()}${path}`); return await r.json(); } catch { return null; }
}

const SYSTEM = `You are the RESEARCH INTELLIGENCE layer of a real trading platform — an early-intelligence desk, not the decision-maker. Your job is to find IMPORTANT NEW INFORMATION before it becomes obvious and determine whether it could change the market narrative, move a stock/sector, or create an early opportunity. You do NOT produce a trading verdict — a separate engine owns that.

Search real, current sources now (Federal Reserve, BEA, BLS, Treasury, CBO, SEC filings, company earnings, academic/industry research, Reuters/Bloomberg/CNBC-tier financial journalism) across these domains: MARKET (SPY/QQQ/IWM/sectors/breadth/volatility/earnings/valuation), ECONOMY (GDP/inflation/employment/consumer spending/manufacturing/housing/productivity/credit), FED/RATES (policy/rate expectations/yield curve/real yields/term premium), FISCAL/GOVERNMENT (debt/deficit/issuance/interest expense/taxes/spending), POLITICS/POLICY (elections/tariffs/regulation/tax/energy/AI/defense/infrastructure policy), and TECHNOLOGY (AI, robotics, automation, semiconductors, photonics, biological computing, quantum computing, neuromorphic computing, advanced nuclear, batteries, grid technology, new computing architectures, and any other emerging technology that could become a major investment theme over 1-10 years — do not limit yourself to famous names).

You are given this platform's own REAL, already-computed macro/market data and its own REAL, already-scored recent news feed below — treat both as ground truth, build on them, do not re-derive or contradict them without genuinely new search evidence.

For every genuinely material finding (skip routine/already-priced-in news), fill a RESEARCH CARD: headline, category (one of: ${RESEARCH_CATEGORIES.join("/")}), classification (one of: ${CLASSIFICATIONS.join("/")} — EARLY_OPPORTUNITY means new + strong evidence + low apparent market awareness; CROWDED/LATE_DO_NOT_CHASE means the move already happened and is now consensus), whatChanged, whyItMatters, marketExpectation (what investors currently seem to believe), mispriced (what may be mispriced or not yet priced in — omit/leave blank if you genuinely see no disconnect, never force one), beneficiaries (tickers/sectors), losers (tickers/sectors), timing ("days"/"weeks"/"months"/"years"), opportunity (0-100: higher when new + strong evidence + low awareness + large potential impact + identifiable affected companies + valuation not yet adjusted + an approaching catalyst), confidence (0-100, your honest confidence in this read), risk (LOW/MEDIUM/HIGH), confirms (what would confirm this thesis), invalidates (what would invalidate it), sources (real outlet/source names you actually found this from), dataQuality (one of: ${DATA_QUALITIES.join("/")} — never present SPECULATION as FACT), and if this is a political statement, policyStatus ("rhetoric" = talk only, "proposed" = a specific proposal not yet law, "confirmed" = actually enacted).

You will also be given YESTERDAY'S research cards below. For each finding today, check if it's a real continuation of one of yesterday's: if so, set priorHeadline to that exact prior headline and set status to STRENGTHENED (new evidence increases conviction), WEAKENED (new evidence decreases it), INVALIDATED (directly contradicted), or UNCHANGED (materially the same, low new information — only include this if worth a compact mention, do not pad the list with unchanged items). If genuinely new, set status to "NEW" and leave priorHeadline null. Do not repeat yesterday's stories with no new information as if they were new.

Separately, for any genuinely emerging technology (not just famous ones) that could create a new industry or disrupt an existing one, fill a TECH DISCOVERY: technology, maturity (e.g. "lab-stage"/"early commercial"/"scaling"), problemSolved, whyNow (why this is becoming relevant now, not 5 years ago or 5 years from now), marketSize, adoptionTimeline, publicCompanies (real tickers if any exist, else empty), supplyChain (key real component/material makers), winners, losers, risks, sources, and the same priorHeadline/status continuation logic against yesterday's tech discoveries.

Separately, evaluate these SIX fixed narrative dimensions using the real data given to you (do not invent numbers) — for each, give your honest current state as a short label (e.g. fed-policy-direction: "CUTTING"/"HOLD-NEUTRAL"/"HOLD-HAWKISH"/"HIKE-RISK"; growth-inflation-regime: "SOFT-LANDING"/"STAGFLATION-LITE"/"RECESSION-RISK"/"REACCELERATION"; ai-narrative: "AI-BOOM"/"AI-PRODUCTIVITY-BOOM"/"AI-CAPEX-BUBBLE-RISK"; consumer-health: "STRONG"/"MIXED"/"STRESSED"; fiscal-stance: "SUPPORTIVE"/"CONSTRAINED"; labor-market: "TIGHT"/"BALANCED"/"SOFTENING") plus a one-sentence whyItMatters for each: ${NARRATIVE_DIMENSIONS.join(", ")}.

Finally, write dailyQuestion: a direct 2-4 sentence answer to "What new information today could change the market, create a new investment theme, or give an opportunity before the crowd?" — a real answer grounded in your findings above, not a generic restatement.

Never invent a fact, ticker, or number. If you found nothing genuinely material in a domain, return fewer cards rather than padding with routine news. Return JSON ONLY, no text outside it:
{"cards":[{"headline":"...","category":"...","classification":"...","whatChanged":"...","whyItMatters":"...","marketExpectation":"...","mispriced":"...","beneficiaries":["..."],"losers":["..."],"timing":"...","opportunity":0-100,"confidence":0-100,"risk":"LOW|MEDIUM|HIGH","confirms":"...","invalidates":"...","sources":["..."],"dataQuality":"...","policyStatus":"rhetoric|proposed|confirmed or omit","priorHeadline":"..." or null,"status":"NEW|STRENGTHENED|WEAKENED|INVALIDATED|UNCHANGED"}],"techDiscoveries":[{"technology":"...","maturity":"...","problemSolved":"...","whyNow":"...","marketSize":"...","adoptionTimeline":"...","publicCompanies":["..."],"supplyChain":["..."],"winners":["..."],"losers":["..."],"risks":["..."],"sources":["..."],"priorHeadline":"..." or null,"status":"..."}],"narrativeShifts":[{"dimension":"...","state":"...","whyItMatters":"..."}],"dailyQuestion":"..."}`;

function summarizeMacro(regimeData) {
  if (!regimeData || !regimeData.ok) return "unavailable this run";
  const r = regimeData;
  return [
    `Regime ${r.label || r.regime || "n/a"} (${r.score ?? "n/a"}/100)`,
    `Treasury score ${r.treasury?.score ?? "n/a"}`,
    `Credit score ${r.credit?.score ?? "n/a"} (momentum ${r.credit?.momentum?.status ?? "n/a"})`,
    `Liquidity score ${r.liquidity?.score ?? "n/a"}`,
    `Employment score ${r.employment?.score ?? "n/a"}`,
    `Breadth ${r.breadth?.score ?? "n/a"}`,
    `Top sectors: ${(r.sectorRotation?.ranked || []).slice(0, 3).map((s) => s.sym).filter(Boolean).join(", ") || "n/a"}`,
    `Sector rotation bias: ${r.sectorRotation?.rotationBias ?? "n/a"}`,
  ].join(" · ");
}

function summarizeNews(feedRows) {
  if (!Array.isArray(feedRows) || !feedRows.length) return "no high-impact items in this platform's own feed in the last 24h";
  return feedRows.slice(0, 15).map((r) => `[${r.category}/${r.impact_score}] ${r.headline}`).join("\n");
}

function summarizePriorCards(cards, label) {
  if (!Array.isArray(cards) || !cards.length) return `none (first real run, or none stored)`;
  return cards.map((c) => `- ${c.headline}${c.classification ? ` [${c.classification}]` : ""}`).join("\n");
}

async function buildResearchIntel() {
  if (!KEY()) return null;

  const [regimeData, newsFeed] = await Promise.all([
    getJson("/api/market/macro-regime"),
    require("./news/store").getFeed({ minImpact: 60, sinceMinutes: 24 * 60, limit: 20 }).catch(() => ({ rows: [] })),
  ]);

  const prevEntry = getMostRecentEntry();
  const priorCards = prevEntry?.cards || [];
  const priorTech = prevEntry?.techDiscoveries || [];
  const priorDimensions = prevEntry?.dimensions || {};

  const prompt = `THIS PLATFORM'S REAL MACRO/MARKET STATE: ${summarizeMacro(regimeData)}

THIS PLATFORM'S REAL HIGH-IMPACT NEWS, LAST 24H (already scored by its own pipeline — build on this, don't re-search for the same stories unless you have genuinely new detail):
${summarizeNews(newsFeed?.rows)}

YESTERDAY'S REAL RESEARCH CARDS (match today's findings against these for status continuation; do not repeat with no new information):
${summarizePriorCards(priorCards)}

YESTERDAY'S REAL TECH DISCOVERIES:
${summarizePriorCards(priorTech)}

YESTERDAY'S REAL NARRATIVE DIMENSION STATES: ${NARRATIVE_DIMENSIONS.map((d) => `${d}=${priorDimensions[d] || "not yet tracked"}`).join(", ")}

Search for real, current information now and return the JSON.`;

  let parsed = null;
  let aiError = null;
  try {
    // maxSearches capped at 3 (2 in saver mode) — command-center-ai.js's own
    // header comment documents that even 8000 max_tokens still failed at 6
    // real search rounds (121s runtime, still no valid JSON): search rounds
    // eat into the same token budget as the final JSON, so more searches
    // makes truncation/timeout MORE likely, not a strictly-better answer.
    // Confirmed live here too — 6 searches timed out against
    // callAnthropicWithSearch's own 120s default before this fix.
    const raw = await callAnthropicWithSearch(prompt + "\n\n" + SYSTEM, KEY(), {
      model: "claude-sonnet-4-6", maxTokens: 8000,
      maxSearches: getMode() === "saver" ? 2 : 3,
      feature: "research-intel",
    });
    const m = (raw || "").match(/\{[\s\S]*\}/);
    parsed = JSON.parse(m ? m[0] : raw);
  } catch (e) {
    aiError = e.message;
    console.warn("[Research Intel] AI generation unavailable:", aiError);
  }
  if (!parsed) return { ok: false, aiUnavailable: true, aiError, generatedAt: Date.now() };

  let cards = sanitizeCards(parsed.cards);
  cards = attachPriorClassification(cards, priorCards);
  const techDiscoveries = sanitizeTechDiscoveries(parsed.techDiscoveries);
  const narrativeShifts = sanitizeNarrativeShifts(parsed.narrativeShifts, priorDimensions);
  const dimensions = dimensionsToSnapshot(narrativeShifts);
  const dailyQuestion = String(parsed.dailyQuestion || "").slice(0, 600);

  const triggers = computeNotificationTriggers({
    narrativeShifts, cards, techDiscoveries,
    invalidatedCount: cards.filter((c) => c.status === "INVALIDATED").length,
  });

  const built = {
    ok: true,
    cards, techDiscoveries, narrativeShifts, dailyQuestion, triggers,
    priorAt: prevEntry?.at || null,
    generatedAt: Date.now(),
  };

  saveCoachOutput("researchIntel", built);
  try { appendSnapshot({ cards, techDiscoveries, dimensions }); } catch { /* non-fatal — tomorrow just won't have a diff */ }

  // Notification logic — spec's explicit "do NOT notify for ordinary news,
  // only these triggers" list, reusing the existing shouldSendAlert gate
  // (never a new alert system). "regime-change" for narrative shifts
  // matches that category's existing meaning exactly; "economic-event" for
  // Fed/policy-material findings; "breaking-news" for the rest (new tech
  // theme, sector/stock catalyst, invalidated research, EARLY->CONFIRMED).
  if (telegramConfigured() && triggers.length) {
    for (const t of triggers.slice(0, 5)) { // real per-run cap, same "don't flood" discipline as sendRegimeAlerts in news/pipeline.js
      const category = t.kind === "NARRATIVE_SHIFT" ? "regime-change" : (t.kind === "FED_OUTLOOK_MATERIAL" || t.kind === "POLICY_MATERIAL") ? "economic-event" : "breaking-news";
      if (!shouldSendAlert({ category })) continue;
      const label = { NARRATIVE_SHIFT: "🚨 NARRATIVE SHIFT", RESEARCH_INVALIDATED: "❌ RESEARCH INVALIDATED", EARLY_BECAME_CONFIRMED: "✅ EARLY OPPORTUNITY CONFIRMED", FED_OUTLOOK_MATERIAL: "🏦 FED/RATES DEVELOPMENT", POLICY_MATERIAL: "🏛️ POLICY DEVELOPMENT", NEW_TECHNOLOGY_THEME: "🔬 NEW TECHNOLOGY THEME", SECTOR_OR_STOCK_CATALYST: "📈 NEW CATALYST" }[t.kind] || t.kind;
      const msg = `${label}\n\n${t.detail}${t.whyItMatters ? `\n\n${t.whyItMatters}` : ""}`;
      await sendTelegramMessage(msg).catch(() => {});
    }
  }

  return built;
}

module.exports = { buildResearchIntel };
